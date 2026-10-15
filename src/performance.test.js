// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { keyAction, instrumentalSpan, guidedSong } from "./performance";
import {
  BUILT_INS,
  groupsToEvents,
  withAccompaniment,
  applyLyrics,
  parseMusicXml,
  validSong,
} from "./music";
const g = (start, lyric = "", section = "", extend = false) => ({
  start,
  lyric,
  section,
  extend,
  duration: 1,
  notes: [{ midi: 60 + start, duration: 1, offset: 0 }],
});
describe("song keys and improvisation", () => {
  const event = BUILT_INS[0].events.find((e) => e.lyric === "简");
  it("advances the melody only on its expected initial", () => {
    expect(keyAction({ key: "J", mode: "lyrics", event })).toEqual({
      type: "melody",
    });
    expect(keyAction({ key: "X", mode: "lyrics", event })).toEqual({
      type: "note",
      midi: 50,
    });
  });
  it("plays fixed notes after completion, during preview and during an instrumental", () => {
    for (const opts of [
      { event: undefined },
      { event, preview: true },
      { event, automatic: true },
    ])
      expect(keyAction({ key: "A", mode: "lyrics", ...opts })).toEqual({
        type: "note",
        midi: 60,
      });
  });
  it("free mode ignores the song and supports octave transposition", () => {
    expect(keyAction({ key: "J", mode: "free", event, octave: 1 })).toEqual({
      type: "note",
      midi: 83,
    });
    expect(keyAction({ key: "X", mode: "any", event })).toEqual({
      type: "melody",
    });
    expect(keyAction({ key: "Escape", mode: "free", event })).toBeNull();
  });
});
describe("instrumental sections", () => {
  it("splits Actor's real intro and outro into manual bars while preserving every note and the section timeline", () => {
    const raw = BUILT_INS[0], score = guidedSong(raw);
    const timeline = song => song.events.flatMap(event => event.notes.map(note => ({
      start: event.start + note.offset, midi: note.midi, duration: note.duration,
    }))).sort((a, b) => a.start - b.start || a.midi - b.midi);
    expect(timeline(score)).toEqual(timeline(raw));
    expect(validSong(score)).toBe(true);
    expect(score.events.filter(event => event.section === '前奏')).toHaveLength(47);
    expect(score.events.filter(event => event.section === '尾奏')).toHaveLength(7);
    expect(score.sections.find(section => section.label === '主歌 1').eventIndex).toBe(47);
    expect(score.events[47]).toMatchObject({ lyric: '简', start: 30.5 });
    expect(score.events[0]).toMatchObject({ initial: 'W', guided: true, auto: false, guidePart: 1, guideParts: 8 });
    expect(keyAction({ key: 'W', mode: 'lyrics', event: score.events[0] })).toEqual({ type: 'melody' });
    expect(keyAction({ key: 'X', mode: 'lyrics', event: score.events[0] })).toEqual({ type: 'note', midi: 50 });
    expect(guidedSong(score)).toEqual(score);
    expect(raw.events[0].notes).toHaveLength(47);
    expect(raw.events[0].guided).toBeUndefined();
  });
  it("preserves an explicit intro and interlude without joining them to a lyric", () => {
    const e = groupsToEvents([
      g(0, "", "前奏"),
      g(1, "", "前奏"),
      g(2, "好"),
      g(3, "", "间奏"),
      g(4, "", "间奏"),
      g(5, "呀"),
    ]);
    expect(e.map((e) => e.section)).toEqual(["前奏", "歌词", "间奏", "歌词"]);
    expect(e[2].notes.map((n) => n.offset)).toEqual([0, 1]);
    expect(instrumentalSpan(e, 0)).toMatchObject({ end: 1, duration: 2 });
  });
  it("respects a lyric extension even across a long melisma", () => {
    const e = groupsToEvents([
      g(0, "好", "", true),
      g(1),
      g(2),
      g(3),
      g(4),
      g(5, "呀"),
    ]);
    expect(e).toHaveLength(2);
    expect(e[0].notes).toHaveLength(5);
  });
  it("infers a long unlabelled gap, while keeping a short melisma attached", () => {
    const e = groupsToEvents([
      g(0, "好"),
      g(1),
      g(2, "呀"),
      g(3),
      g(4),
      g(5),
      g(6),
      g(7, "你"),
    ]);
    expect(e[0].notes).toHaveLength(2);
    expect(e[2]).toMatchObject({
      section: "间奏",
      inferred: true,
      kind: "instrumental",
    });
  });
  it("imports the complete original fixture including both staves and all instrumental passages", () => {
    const score = parseMusicXml(
      readFileSync("public/examples/instrumental-practice.musicxml", "utf8"),
    );
    const combined = withAccompaniment(
      score.tracks[0].events,
      score.tracks.slice(1),
    );
    expect(
      combined
        .filter((e) => e.kind === "instrumental")
        .map((e) => [e.section, e.start, e.duration]),
    ).toEqual([
      ["前奏", 0, 4],
      ["间奏", 10, 4],
      ["尾奏", 20, 4],
    ]);
    expect(
      combined
        .filter((e) => e.lyric)
        .map((e) => e.lyric)
        .join(""),
    ).toBe("把每次敲击都变成小小旋律");
    expect(combined.reduce((sum, e) => sum + e.notes.length, 0)).toBe(36);
  });
  it("does not assign pasted lyric characters to instrumental passages", () => {
    const source = BUILT_INS[2].events,
      e = applyLyrics(source, "把每次敲击都变成小小旋律");
    expect(e[0].kind).toBe("instrumental");
    expect(e[0].lyric).toBe("");
    expect(e[1].lyric).toBe("把");
    expect(e[7].kind).toBe("instrumental");
  });
  it("keeps a piano intro and interlude that only exist in another staff", () => {
    const vocal = [
      { ...BUILT_INS[1].events[0], start: 4 },
      { ...BUILT_INS[1].events[1], start: 10 },
    ];
    const e = withAccompaniment(vocal, [
      {
        events: Array.from({ length: 11 }, (_, i) => ({
          ...g(i),
          notes: [{ midi: 48, duration: 1, offset: 0 }],
        })),
      },
    ]);
    expect(e.map((e) => e.section)).toContain("前奏");
    expect(e.map((e) => e.section)).toContain("间奏");
    expect(e[0]).toMatchObject({ start: 0, duration: 4, kind: "instrumental" });
    expect(e[1].notes).toHaveLength(2);
    expect(vocal[0].notes).toHaveLength(1);
  });
  it("reads score direction words as section boundaries", () => {
    const n = (lyric = "") =>
      `<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration>${lyric ? `<lyric><text>${lyric}</text></lyric>` : ""}</note>`;
    const xml = `<score-partwise><part-list><score-part id="P"><part-name>旋律</part-name></score-part></part-list><part id="P"><measure><direction><direction-type><words>前奏</words></direction-type></direction>${n()}${n("好")}<direction><direction-type><words>间奏</words></direction-type></direction>${n()}${n("呀")}</measure></part></score-partwise>`;
    const e = parseMusicXml(xml).tracks[0].events;
    expect(e.map((e) => e.section)).toEqual(["前奏", "歌词", "间奏", "歌词"]);
  });
});
