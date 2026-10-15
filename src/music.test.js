// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { zipSync, strToU8 } from "fflate";
import { writeMidi } from "midi-file";
import {
  parseMusicXml,
  parseMidiScore,
  groupsToEvents,
  applyLyrics,
  mergeWithPrevious,
  importScoreFile,
  validSong,
  BUILT_INS,
  initialsFor,
} from "./music";
const score = (notes) =>
  `<score-partwise><part-list><score-part id="P"><part-name>人声</part-name></score-part></part-list><part id="P"><measure><attributes><divisions>4</divisions></attributes>${notes}</measure></part></score-partwise>`;
const n = (step, dur, other = "") =>
  `<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>${dur}</duration>${other}</note>`;
describe("MusicXML to keyboard gestures", () => {
  it("loads example lyrics, pitches and contextual initials", () => {
    const s = parseMusicXml(
      readFileSync("public/examples/little-melody.musicxml", "utf8"),
    );
    expect(s.tracks[0].events).toHaveLength(12);
    expect(s.tracks[0].events[0]).toMatchObject({
      lyric: "把",
      initial: "B",
      start: 0,
    });
    expect(s.bpm).toBe(84);
    expect(initialsFor(["重", "庆"])).toEqual(["C", "Q"]);
  });
  it("keeps a melisma, chord, tied note and rest inside the right gesture", () => {
    const s = parseMusicXml(
      score(
        n("C", 4, '<tie type="start"/><lyric><text>好</text></lyric>') +
          n("E", 4, "<chord/>") +
          n("C", 4, '<tie type="stop"/>') +
          "<note><rest/><duration>4</duration></note>" +
          n("G", 4) +
          n("D", 4, "<lyric><text>呀</text></lyric>"),
      ),
    );
    const e = s.tracks[0].events;
    expect(e).toHaveLength(2);
    expect(e[0].notes.map((n) => [n.midi, n.duration, n.offset])).toEqual([
      [60, 2, 0],
      [64, 1, 0],
      [67, 1, 3],
    ]);
    expect(e[1].start).toBe(4);
  });
  it("keeps simultaneous voices separate after backup", () => {
    const s = parseMusicXml(
      score(
        n("C", 4, "<voice>1</voice>") +
          "<backup><duration>4</duration></backup>" +
          n("E", 4, "<voice>2</voice>"),
      ),
    );
    expect(s.tracks).toHaveLength(2);
    expect(s.tracks.map((t) => t.events[0].start)).toEqual([0, 0]);
  });
  it("unfolds a simple repeat once", () => {
    const s = parseMusicXml(
      score(
        '<barline location="left"><repeat direction="forward"/></barline>' +
          n("C", 4) +
          '<barline location="right"><repeat direction="backward"/></barline>',
      ),
    );
    expect(s.tracks[0].events.map((e) => e.start)).toEqual([0, 1]);
  });
  it("reads the declared MXL root rather than an incidental XML file", async () => {
    const xml = score(n("C", 4));
    const bytes = zipSync({
      "META-INF/container.xml": strToU8(
        '<container><rootfiles><rootfile full-path="scores/main.xml"/></rootfiles></container>',
      ),
      "metadata.xml": strToU8("<metadata/>"),
      "scores/main.xml": strToU8(xml),
    });
    const s = await importScoreFile({
      name: "demo.mxl",
      size: bytes.length,
      arrayBuffer: async () => bytes.buffer,
    });
    expect(s.tracks[0].events[0].notes[0].midi).toBe(60);
  });
  it("rejects malformed XML and scores with no playable notes", () => {
    expect(() => parseMusicXml("<score-partwise>")).toThrow();
    expect(() => parseMusicXml(score(""))).toThrow("没有找到");
  });
});
describe("MIDI and lyric alignment", () => {
  it("uses note-off duration, chord onset, tempo and lyrics across meta tracks", () => {
    const bytes = writeMidi({
      header: { format: 1, numTracks: 2, ticksPerBeat: 480 },
      tracks: [
        [
          { deltaTime: 0, type: "setTempo", microsecondsPerBeat: 600000 },
          { deltaTime: 0, type: "lyrics", text: "Hello" },
          { deltaTime: 0, type: "endOfTrack" },
        ],
        [
          {
            deltaTime: 0,
            type: "noteOn",
            channel: 0,
            noteNumber: 60,
            velocity: 90,
          },
          {
            deltaTime: 0,
            type: "noteOn",
            channel: 0,
            noteNumber: 64,
            velocity: 90,
          },
          {
            deltaTime: 480,
            type: "noteOff",
            channel: 0,
            noteNumber: 60,
            velocity: 0,
          },
          {
            deltaTime: 0,
            type: "noteOff",
            channel: 0,
            noteNumber: 64,
            velocity: 0,
          },
          { deltaTime: 0, type: "endOfTrack" },
        ],
      ],
    });
    const s = parseMidiScore(Uint8Array.from(bytes), "test.mid");
    expect(s.bpm).toBe(100);
    expect(s.tracks[0].events).toHaveLength(1);
    expect(s.tracks[0].events[0]).toMatchObject({
      initial: "H",
      lyric: "Hello",
    });
    expect(s.tracks[0].events[0].notes).toHaveLength(2);
  });
  it("merges a continued syllable without losing the time gap", () => {
    const e = BUILT_INS[1].events.slice(0, 3);
    const merged = mergeWithPrevious(e, 1);
    expect(merged).toHaveLength(2);
    expect(merged[0].notes[1].offset).toBe(1);
    expect(merged[0].duration).toBe(2);
    expect(e[0].notes).toHaveLength(1);
  });
  it("generates first letters and keeps missing lyrics playable", () => {
    const e = applyLyrics(BUILT_INS[1].events, "你 好");
    expect(e[0].initial).toBe("N");
    expect(e[1].initial).toBe("H");
    expect(e[2].lyric).toBe("");
    expect(validSong({ ...BUILT_INS[1], events: e })).toBe(true);
  });
  it("validates saved data and can import an exported backup", async () => {
    expect(BUILT_INS.every(validSong)).toBe(true);
    expect(
      validSong({ ...BUILT_INS[0], events: [{ initial: "", notes: [] }] }),
    ).toBe(false);
    const bytes = strToU8(JSON.stringify(BUILT_INS[0]));
    const s = await importScoreFile({
      name: "backup.json",
      size: bytes.length,
      arrayBuffer: async () => bytes.buffer,
    });
    expect(s.tracks[0].events).toEqual(BUILT_INS[0].events);
  });
});

import { changeDuration } from "./music";
it("shifts subsequent notes when a syllable duration is corrected", () => {
  const events = BUILT_INS[1].events;
  const next = changeDuration(events, 0, 2);
  expect(next[0].notes[0].duration).toBe(2);
  expect(next[1].start).toBe(2);
  expect(next[2].start).toBe(3);
  expect(events[1].start).toBe(1);
});

it("handles Chinese and Latin lyric tokens together", () => {
  expect(initialsFor(["Hello", "World", "你", "好"])).toEqual([
    "H",
    "W",
    "N",
    "H",
  ]);
});
