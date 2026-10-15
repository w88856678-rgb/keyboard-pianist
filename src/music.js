import { pinyin } from "pinyin-pro";
import { unzipSync, strFromU8 } from "fflate";
import { parseMidi } from "midi-file";
import actorFull from "./data/actor-full.json";
import chengduFull from "./data/chengdu-full.json";
import mainstreamSongs from "./data/mainstream.js";

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const pitchName = (midi) =>
  `${NAMES[((Number(midi) % 12) + 12) % 12]}${Math.floor(Number(midi) / 12) - 1}`;
export function pitchMidi(name) {
  const m = String(name)
    .trim()
    .match(/^([A-Ga-g])([#b]?)(-?\d)$/);
  if (!m) return null;
  const n =
    { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1].toUpperCase()] +
    (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) +
    (Number(m[3]) + 1) * 12;
  return n >= 21 && n <= 108 ? n : null;
}
export const lyricTokens = (text) =>
  String(text).match(/[\p{Script=Han}]|[a-zA-Z]+|[0-9]+/gu) || [];
export function initialsFor(tokens) {
  const py = pinyin(tokens.join(""), {
    toneType: "none",
    type: "array",
    nonZh: "removed",
  });
  let at = 0;
  return tokens.map((token) => {
    const chars = [...token];
    const hanCount = chars.filter((c) => /\p{Script=Han}/u.test(c)).length;
    const first = chars.find((c) => /[\p{Script=Han}a-zA-Z0-9]/u.test(c)) || "";
    const initial = /\p{Script=Han}/u.test(first)
      ? (py[at] || first).slice(0, 1)
      : first;
    at += hanCount;
    return initial.toUpperCase();
  });
}
const children = (node, name) =>
  Array.from(node?.children || []).filter((n) => n.localName === name);
const child = (node, name) => children(node, name)[0];
const txt = (node, name) => child(node, name)?.textContent?.trim() || "";
const num = (node, name, fallback = 0) => Number(txt(node, name)) || fallback;
function xmlDocument(text) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror"))
    throw new Error("乐谱 XML 格式有误，请重新导出 MusicXML。");
  return doc;
}

export const KEY_PITCHES = Object.freeze({
  Z: 48,
  X: 50,
  C: 52,
  V: 53,
  B: 55,
  N: 57,
  M: 59,
  A: 60,
  S: 62,
  D: 64,
  F: 65,
  G: 67,
  H: 69,
  J: 71,
  K: 72,
  L: 74,
  Q: 61,
  W: 63,
  E: 66,
  R: 68,
  T: 70,
  Y: 73,
  U: 75,
  I: 78,
  O: 80,
  P: 82,
});
export const FREE_KEYS = Object.keys(KEY_PITCHES).join("");
export const freeKeyFor = (midi, i = 0) =>
  Object.keys(KEY_PITCHES).find((k) => KEY_PITCHES[k] === midi) ||
  FREE_KEYS[
    (((Number(midi) - 48) % FREE_KEYS.length) + FREE_KEYS.length) %
      FREE_KEYS.length
  ] ||
  FREE_KEYS[i % FREE_KEYS.length];
const instrumentalNames = new Set(["前奏", "间奏", "尾奏", "器乐"]);
export function sectionName(text) {
  if (/前奏|intro|prelude/i.test(text)) return "前奏";
  if (/间奏|interlude|instrumental/i.test(text)) return "间奏";
  if (/尾奏|outro|coda/i.test(text)) return "尾奏";
  if (/主歌|副歌|verse|chorus|vocal/i.test(text)) return "歌词";
  return "";
}
export function groupsToEvents(groups) {
  const ordered = [...groups].sort((a, b) => a.start - b.start);
  const hasLyrics = ordered.some((g) => g.lyric);
  const events = [];
  for (let i = 0; i < ordered.length; ) {
    const group = ordered[i];
    if (!group.lyric) {
      let end = i + 1;
      while (
        end < ordered.length &&
        !ordered[end].lyric &&
        (ordered[end].section || "") === (group.section || "")
      )
        end++;
      const run = ordered.slice(i, end),
        last = events.at(-1);
      const span = run.at(-1).start + run.at(-1).duration - group.start;
      const explicit = instrumentalNames.has(group.section);
      const inferred =
        hasLyrics && !last
          ? "前奏"
          : hasLyrics && !last?.extend && span >= 4
            ? end === ordered.length
              ? "尾奏"
              : "间奏"
            : "";
      if (explicit || inferred) {
        const e = {
          lyric: "",
          initial: freeKeyFor(group.notes[0]?.midi),
          start: group.start,
          duration: span,
          notes: run.flatMap((g) =>
            g.notes.map((n) => ({
              ...n,
              offset: g.start - group.start + (n.offset || 0),
            })),
          ),
          kind: "instrumental",
          section: explicit ? group.section : inferred,
          auto: true,
          inferred: !explicit,
        };
        events.push(e);
        i = end;
        continue;
      }
      if (hasLyrics && last?.lyric && !group.forceSeparate) {
        for (const g of run) {
          last.notes.push(
            ...g.notes.map((n) => ({
              ...n,
              offset: g.start - last.start + (n.offset || 0),
            })),
          );
          last.duration = Math.max(
            last.duration,
            g.start - last.start + g.duration,
          );
        }
        i = end;
        continue;
      }
    }
    events.push({
      lyric: group.lyric || "",
      initial: "",
      start: group.start,
      duration: group.duration,
      notes: group.notes.map((n) => ({ ...n, offset: n.offset || 0 })),
      kind: group.lyric ? "vocal" : "notes",
      section: group.lyric ? "歌词" : "音符",
      extend: !!group.extend,
    });
    i++;
  }
  const initials = initialsFor(
    events.filter((e) => e.lyric).map((e) => e.lyric),
  );
  let at = 0;
  return events.map((e, i) => ({
    ...e,
    initial: e.lyric
      ? initials[at++]
      : e.initial || freeKeyFor(e.notes[0]?.midi, i),
  }));
}
export function withAccompaniment(events, tracks) {
  const result = events.map((e) => ({
    ...e,
    notes: e.notes.map((n) => ({ ...n })),
  }));
  const other = tracks
    .flatMap((t) =>
      t.events.flatMap((e) =>
        e.notes.map((n) => ({
          ...n,
          at: e.start + (n.offset || 0),
          velocity: 0.45,
        })),
      ),
    )
    .sort((a, b) => a.at - b.at);
  if (!other.length) return result;
  const first = result[0];
  if (other[0].at < first.start)
    result.unshift({
      kind: "instrumental",
      section: "前奏",
      auto: true,
      lyric: "",
      initial: freeKeyFor(other[0].midi),
      start: other[0].at,
      duration: first.start - other[0].at,
      notes: [],
    });
  // A vocal rest of a full bar or more may contain an interlude in the piano part.
  for (let i = 0; i < result.length - 1; i++) {
    const e = result[i],
      next = result[i + 1],
      end = e.start + e.duration;
    if (
      e.kind !== "instrumental" &&
      next.start - end >= 4 &&
      other.some((n) => n.at >= end && n.at < next.start)
    ) {
      result.splice(i + 1, 0, {
        kind: "instrumental",
        section: "间奏",
        auto: true,
        lyric: "",
        initial: "A",
        start: end,
        duration: next.start - end,
        notes: [],
      });
      i++;
    }
  }
  const final = result.at(-1),
    tailStart = final.start + final.duration,
    tail = other.filter((n) => n.at >= tailStart);
  if (tail.length)
    result.push({
      kind: "instrumental",
      section: "尾奏",
      auto: true,
      lyric: "",
      initial: freeKeyFor(tail[0].midi),
      start: tailStart,
      duration: Math.max(...tail.map((n) => n.at + n.duration)) - tailStart,
      notes: [],
    });
  const known = new Set(
    result.flatMap((e) =>
      e.notes.map(
        (n) =>
          `${n.midi}:${(e.start + n.offset).toFixed(5)}:${n.duration.toFixed(5)}`,
      ),
    ),
  );
  for (const n of other) {
    const signature = `${n.midi}:${n.at.toFixed(5)}:${n.duration.toFixed(5)}`;
    if (known.has(signature)) continue;
    known.add(signature);
    const target = result.findLast((e) => e.start <= n.at);
    if (target)
      target.notes.push({
        midi: n.midi,
        duration: n.duration,
        offset: n.at - target.start,
        velocity: 0.45,
      });
  }
  return result.filter((e) => e.notes.length);
}

function measureOrder(measures) {
  const result = [];
  let repeatStart = 0;
  const repeated = new Set();
  let skipping = false;
  for (let i = 0; i < measures.length && result.length < 10000; i++) {
    const bars = children(measures[i], "barline");
    const endings = bars.flatMap((b) => children(b, "ending"));
    if (
      endings.some(
        (e) =>
          e.getAttribute("type") === "start" &&
          e.getAttribute("number") === "1",
      ) &&
      repeated.size
    )
      skipping = true;
    if (!skipping) result.push(measures[i]);
    if (
      bars.some((b) =>
        children(b, "repeat").some(
          (r) => r.getAttribute("direction") === "forward",
        ),
      )
    )
      repeatStart = i;
    if (
      bars.some((b) =>
        children(b, "repeat").some(
          (r) => r.getAttribute("direction") === "backward",
        ),
      )
    ) {
      if (!repeated.has(i)) {
        repeated.add(i);
        i = repeatStart - 1;
      } else skipping = false;
    }
    if (
      endings.some((e) =>
        ["stop", "discontinue"].includes(e.getAttribute("type")),
      )
    )
      skipping = false;
  }
  return result;
}
export function parseMusicXml(text, filename = "导入的乐曲") {
  const doc = xmlDocument(text);
  const root = doc.documentElement;
  if (root.localName !== "score-partwise")
    throw new Error(
      "目前支持 score-partwise MusicXML，请用打谱软件导出此格式。",
    );
  const title =
    txt(child(root, "work"), "work-title") ||
    txt(root, "movement-title") ||
    filename.replace(/\.[^.]+$/, "");
  const creator =
    children(child(root, "identification"), "creator").find(
      (n) => n.getAttribute("type") === "composer",
    )?.textContent || "导入的乐谱";
  const names = new Map(
    children(child(root, "part-list"), "score-part").map((p) => [
      p.id,
      txt(p, "part-name"),
    ]),
  );
  let bpm = 83;
  const sound = doc.querySelector("sound[tempo]");
  if (sound) bpm = Number(sound.getAttribute("tempo")) || 83;
  const perMinute = doc.querySelector("per-minute");
  if (!sound && perMinute) bpm = Number(perMinute.textContent) || 83;
  const tracks = [];
  for (const part of children(root, "part")) {
    let divisions = 1,
      absolute = 0,
      transpose = 0,
      currentSection = "";
    const voices = new Map();
    const ties = new Map();
    for (const measure of measureOrder(children(part, "measure"))) {
      let cursor = 0,
        extent = 0,
        previousStart = 0;
      for (const el of Array.from(measure.children)) {
        if (el.localName === "attributes") {
          divisions = num(el, "divisions", divisions);
          const trans = child(el, "transpose");
          if (trans)
            transpose =
              num(trans, "chromatic") + num(trans, "octave-change") * 12;
        } else if (el.localName === "direction") {
          const marker = sectionName(el.textContent);
          if (marker) currentSection = marker;
        } else if (el.localName === "backup")
          cursor -= num(el, "duration") / divisions;
        else if (el.localName === "forward") {
          cursor += num(el, "duration") / divisions;
          extent = Math.max(extent, cursor);
        } else if (el.localName === "note") {
          if (child(el, "grace")) continue;
          const duration = num(el, "duration", divisions) / divisions;
          const chord = !!child(el, "chord");
          const onset = absolute + (chord ? previousStart : cursor);
          if (!chord) {
            previousStart = cursor;
            cursor += duration;
            extent = Math.max(extent, cursor);
          }
          if (child(el, "rest") || !child(el, "pitch")) continue;
          const pitch = child(el, "pitch");
          const midi =
            12 * (num(pitch, "octave", 4) + 1) +
            { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[txt(pitch, "step")] +
            num(pitch, "alter") +
            transpose;
          if (!Number.isFinite(midi)) continue;
          const voice = txt(el, "voice") || "1";
          const staff = txt(el, "staff") || "1";
          const key = `${voice}:${staff}`;
          if (!voices.has(key)) voices.set(key, []);
          const list = voices.get(key);
          const tieTypes = children(el, "tie").map((t) =>
            t.getAttribute("type"),
          );
          const tieKey = `${key}:${midi}`;
          if (tieTypes.includes("stop") && ties.has(tieKey)) {
            const held = ties.get(tieKey);
            held.note.duration += duration;
            held.group.duration = Math.max(
              held.group.duration,
              onset - held.group.start + duration,
            );
            if (!tieTypes.includes("start")) ties.delete(tieKey);
            continue;
          }
          let group = list.at(-1);
          if (!group || Math.abs(group.start - onset) > 0.0001) {
            group = {
              start: onset,
              duration,
              notes: [],
              lyric: "",
              section: currentSection,
            };
            list.push(group);
          }
          const lyric =
            children(el, "lyric").find(
              (l) =>
                !l.getAttribute("number") || l.getAttribute("number") === "1",
            ) || child(el, "lyric");
          if (lyric)
            group.lyric =
              children(lyric, "text")
                .map((t) => t.textContent)
                .join("") || group.lyric;
          if (group.lyric) {
            group.section = "歌词";
            currentSection = "歌词";
          }
          group.extend ||= !!child(lyric, "extend");
          const note = { midi, duration, offset: 0 };
          group.notes.push(note);
          group.duration = Math.max(group.duration, duration);
          if (tieTypes.includes("start")) ties.set(tieKey, { note, group });
        }
      }
      absolute += extent;
    }
    for (const [voice, groups] of voices) {
      if (groups.length)
        tracks.push({
          id: `${part.id}-${voice}`,
          name: `${names.get(part.id) || part.id} · 声部 ${voice.replace(":", " / ")}`,
          events: groupsToEvents(groups),
        });
    }
  }
  if (!tracks.length) throw new Error("这份乐谱中没有找到可演奏的音符。");
  tracks.sort(
    (a, b) =>
      Number(b.events.some((e) => e.lyric)) -
      Number(a.events.some((e) => e.lyric)),
  );
  return {
    title,
    artist: creator,
    bpm: Math.max(30, Math.min(240, Math.round(bpm))),
    tracks,
    kind: "MusicXML",
    needsReview: tracks.some((t) => t.events.some((e) => e.inferred)),
    reviewMessage: "已识别无歌词器乐段，请确认前奏、间奏与尾奏的划分。",
  };
}

function decodeMidiText(text) {
  if ([...text].every((c) => c.charCodeAt(0) < 128)) return text;
  const bytes = Uint8Array.from(text, (c) => c.charCodeAt(0));
  const utf = new TextDecoder("utf-8").decode(bytes);
  return utf.includes("\uFFFD")
    ? new TextDecoder("gb18030").decode(bytes)
    : utf;
}
export function parseMidiScore(bytes, filename = "导入的乐曲") {
  const parsed = parseMidi(bytes);
  const ppq = parsed.header.ticksPerBeat;
  if (!ppq)
    throw new Error("暂不支持 SMPTE 时间制 MIDI，请导出 PPQ 时间制文件。");
  let bpm = 120;
  const tracks = [];
  const allLyrics = [];
  const timed = parsed.tracks.map((track) => {
    let at = 0;
    return track.map((e) => {
      at += e.deltaTime;
      return { ...e, at };
    });
  });
  for (const track of timed)
    for (const e of track) {
      if (e.type === "setTempo" && e.at === 0)
        bpm = Math.round(60000000 / e.microsecondsPerBeat);
      if (e.type === "lyrics")
        allLyrics.push({
          at: e.at,
          text: decodeMidiText(e.text)
            .replace(/[\/\\]/g, "")
            .trim(),
        });
    }
  timed.forEach((track, index) => {
    const active = new Map(),
      notes = [];
    let name = `音轨 ${index + 1}`;
    for (const e of track) {
      if (e.type === "trackName") name = decodeMidiText(e.text) || name;
      if (e.channel === 9) continue;
      const key = `${e.channel}:${e.noteNumber}`;
      if (e.type === "noteOn" && e.velocity > 0) {
        if (!active.has(key)) active.set(key, []);
        active.get(key).push(e);
      } else if (
        e.type === "noteOff" ||
        (e.type === "noteOn" && e.velocity === 0)
      ) {
        const start = active.get(key)?.shift();
        if (start)
          notes.push({
            start: start.at / ppq,
            midi: e.noteNumber,
            duration: Math.max(0.125, (e.at - start.at) / ppq),
            channel: e.channel,
          });
      }
    }
    const byChannel = new Map();
    for (const n of notes) {
      if (!byChannel.has(n.channel)) byChannel.set(n.channel, []);
      byChannel.get(n.channel).push(n);
    }
    for (const [channel, items] of byChannel) {
      items.sort((a, b) => a.start - b.start);
      const groups = [];
      for (const n of items) {
        let group = groups.at(-1);
        if (!group || Math.abs(group.start - n.start) > 0.01) {
          group = {
            start: n.start,
            duration: n.duration,
            notes: [],
            lyric: "",
          };
          groups.push(group);
        }
        group.notes.push({ midi: n.midi, duration: n.duration, offset: 0 });
        group.duration = Math.max(group.duration, n.duration);
      }
      const own = track
        .filter((e) => e.type === "lyrics")
        .map((e) => ({
          at: e.at,
          text: decodeMidiText(e.text)
            .replace(/[\/\\]/g, "")
            .trim(),
        }));
      for (const l of own.length ? own : allLyrics) {
        const g = groups.find((g) => g.start >= l.at / ppq - 0.04);
        if (g && l.text) g.lyric = l.text;
      }
      for (const g of groups) {
        const marker = track
          .filter((e) => e.type === "marker" && e.at / ppq <= g.start)
          .at(-1);
        if (marker) g.section = sectionName(decodeMidiText(marker.text));
      }
      if (groups.length)
        tracks.push({
          id: `${index}-${channel}`,
          name: `${name}${byChannel.size > 1 ? ` · 通道 ${channel + 1}` : ""}`,
          events: groupsToEvents(groups),
        });
    }
  });
  if (!tracks.length) throw new Error("MIDI 中没有找到旋律音轨。");
  return {
    title: filename.replace(/\.[^.]+$/, ""),
    artist: "MIDI 导入",
    bpm,
    tracks,
    kind: "MIDI",
  };
}
export async function importScoreFile(
  file,
  onProgress = () => {},
  notation = "auto",
) {
  if (file.size > 30 * 1024 * 1024)
    throw new Error("请选择 30 MB 以内的乐谱文件。");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ext = file.name.split(".").at(-1).toLowerCase();
  if (ext === "json") {
    let s;
    try {
      s = JSON.parse(strFromU8(bytes));
    } catch {
      throw new Error("曲谱备份格式不完整，请重新导出 JSON 文件后再导入。");
    }
    if (!validSong(s)) throw new Error("这不是有效的键盘曲谱备份。");
    return {
      title: s.title,
      artist: s.artist,
      bpm: s.bpm,
      tracks: [{ id: "backup", name: "键盘曲谱", events: s.events }],
      kind: "曲谱备份",
    };
  }
  if (["mid", "midi"].includes(ext)) return parseMidiScore(bytes, file.name);
  if (ext === "mxl") {
    const files = unzipSync(bytes);
    if (
      Object.values(files).reduce((s, b) => s + b.length, 0) >
      60 * 1024 * 1024
    )
      throw new Error("乐谱解压后过大，请拆分后导入。");
    const container = files["META-INF/container.xml"];
    let path = container
      ? xmlDocument(strFromU8(container))
          .querySelector("rootfile")
          ?.getAttribute("full-path")
      : null;
    path =
      path ||
      Object.keys(files).find(
        (p) => /\.(musicxml|xml)$/i.test(p) && !p.startsWith("META-INF/"),
      );
    if (!path || !files[path]) throw new Error("MXL 中缺少主乐谱文件。");
    return parseMusicXml(strFromU8(files[path]), file.name);
  }
  if (["xml", "musicxml"].includes(ext))
    return parseMusicXml(strFromU8(bytes), file.name);
  if (["png", "jpg", "jpeg", "webp", "pdf"].includes(ext)) {
    onProgress("正在加载本地识谱引擎…");
    const { recognizeScore } = await import("./omr.js");
    const xml = await recognizeScore(
      bytes,
      file.type ||
        (ext === "pdf"
          ? "application/pdf"
          : `image/${ext === "jpg" ? "jpeg" : ext}`),
      notation,
      onProgress,
    );
    return {
      ...parseMusicXml(xml, file.name),
      kind: "识谱结果",
      needsReview: true,
    };
  }
  throw new Error("请选择 MusicXML、MXL、MIDI、PNG、JPG、WebP 或 PDF。");
}
export function applyLyrics(events, text) {
  const tokens = lyricTokens(text),
    initials = initialsFor(tokens);
  const matches = [...String(text).matchAll(/[\p{Script=Han}]|[a-zA-Z]+|[0-9]+/gu)];
  const lineStarts = matches.map((match, i) => i === 0 ||
    /[\n，。！？；,.!?;]/.test(String(text).slice(matches[i - 1].index + matches[i - 1][0].length, match.index)));
  let at = 0;
  return events.map((e, i) => {
    if (e.kind === "instrumental")
      return { ...e, notes: e.notes.map((n) => ({ ...n })) };
    const lyric = tokens[at] || "",
      lineStart = !!lyric && lineStarts[at],
      initial = initials[at++] || freeKeyFor(e.notes[0].midi, i);
    return {
      ...e,
      lyric,
      initial,
      lineStart,
      kind: lyric ? "vocal" : "notes",
      notes: e.notes.map((n) => ({ ...n })),
    };
  });
}
export function mergeWithPrevious(events, index) {
  if (index < 1) return events;
  const result = events.map((e) => ({
    ...e,
    notes: e.notes.map((n) => ({ ...n })),
  }));
  const e = result[index],
    prev = result[index - 1];
  prev.notes.push(
    ...e.notes.map((n) => ({ ...n, offset: e.start - prev.start + n.offset })),
  );
  prev.duration = Math.max(prev.duration, e.start - prev.start + e.duration);
  result.splice(index, 1);
  return result;
}
export function changeDuration(events, index, duration) {
  const old = events[index];
  if (!old || !Number.isFinite(duration) || duration <= 0) return events;
  const delta = duration - old.duration;
  return events.map((e, i) =>
    i < index
      ? e
      : i === index
        ? {
            ...e,
            duration,
            notes: e.notes.map((n) => ({
              ...n,
              duration: (n.duration * duration) / old.duration,
              offset: (n.offset * duration) / old.duration,
            })),
          }
        : { ...e, start: e.start + delta },
  );
}
export function validSong(song) {
  return (
    song &&
    typeof song.id === "string" &&
    typeof song.title === "string" &&
    Number.isFinite(song.bpm) &&
    song.bpm >= 30 &&
    song.bpm <= 240 &&
    Array.isArray(song.events) &&
    song.events.length > 0 &&
    song.events.length <= 10000 &&
    song.events.every(
      (e) =>
        typeof e.initial === "string" &&
        /^[A-Z0-9]$/.test(e.initial) &&
        Number.isFinite(e.start) &&
        e.start >= 0 &&
        Number.isFinite(e.duration) &&
        e.duration > 0 &&
        e.notes?.length &&
        e.notes.every(
          (n) =>
            Number.isFinite(n.midi) &&
            n.midi >= 21 &&
            n.midi <= 108 &&
            Number.isFinite(n.duration) &&
            n.duration > 0 &&
            Number.isFinite(n.offset) &&
            n.offset >= 0,
        ),
    )
  );
}
const event = (lyric, initial, midi, start, duration = 1) => ({
  lyric,
  initial,
  start,
  duration,
  notes: [{ midi, duration, offset: 0 }],
});
export const BUILT_INS = [
  actorFull,
  {
    id: "little-melody",
    title: "原创练习曲",
    artist: "自编练习",
    bpm: 84,
    tag: "入门练习",
    source: "原创旋律 · 12 个按键",
    events: [..."把每次敲击都变成小小旋律"].map((s, i) =>
      event(
        s,
        initialsFor([s])[0],
        [60, 64, 67, 72, 71, 67, 65, 69, 67, 64, 62, 60][i],
        i,
        i === 11 ? 2 : 1,
      ),
    ),
  },
];

const instrumentalEvent = (section, start, notes, duration = 4) => ({
  lyric: "",
  initial: freeKeyFor(notes[0]),
  kind: "instrumental",
  section,
  auto: true,
  start,
  duration,
  notes: notes.map((midi, i) => ({
    midi,
    duration: section === "尾奏" ? 4 : 1,
    offset: section === "尾奏" ? 0 : i,
  })),
});
BUILT_INS.push({
  id: "instrumental-practice",
  title: "器乐段练习",
  artist: "原创编排",
  bpm: 120,
  tag: "含前奏 · 间奏 · 尾奏",
  source: "原创示例 · 自动器乐段与手动歌词衔接",
  events: [
    instrumentalEvent("前奏", 0, [48, 64, 67, 72]),
    ...BUILT_INS[1].events
      .slice(0, 6)
      .map((e) => ({ ...e, start: e.start + 4 })),
    instrumentalEvent("间奏", 10, [65, 69, 67, 64]),
    ...BUILT_INS[1].events.slice(6).map((e) => ({
      ...e,
      start: e.start + 8,
      duration: 1,
      notes: e.notes.map((n) => ({ ...n, duration: 1 })),
    })),
    instrumentalEvent("尾奏", 20, [48, 55, 60]),
  ],
});
BUILT_INS.push(chengduFull);

BUILT_INS.push(...mainstreamSongs);
