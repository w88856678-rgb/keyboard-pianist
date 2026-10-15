import { describe, it, expect } from "vitest";
import { BUILT_INS, applyLyrics } from "./music";
import { noteSteps, noteSequence, scoreLines, lyricsWithLines } from "./guidance";

describe("continuous song guidance", () => {
  it("keeps every complete Actor sentence in one continuous score, including both instrumentals", () => {
    const lines = scoreLines(BUILT_INS[0]);
    expect(lines.filter(line => !line.instrumental)).toHaveLength(49);
    expect(lines.slice(1, 4).map(line => line.text)).toEqual(["简单点", "说话的方式简单点", "递进的情绪请省略"]);
    expect(lines.find(line => line.start === 67).text).toBe("该配合你演出的我演视而不见");
    expect(lines.flatMap(line => line.items).map(item => item.event)).toEqual(BUILT_INS[0].events);
    expect(lines.filter(line => line.instrumental).map(line => line.section)).toEqual(["前奏", "尾奏"]);
  });
  it("shows chords together and sequential notes in chronological order without mutating the score", () => {
    const event = { notes: [
      { midi: 67, offset: 1 }, { midi: 64, offset: 0 },
      { midi: 60, offset: 0 }, { midi: 60, offset: 0 },
      { midi: 69, offset: 2 },
    ] };
    expect(noteSequence(event)).toBe("E4 + C4 → G4 → A4");
    expect(noteSteps(event).map(step => step.offset)).toEqual([0, 1, 2]);
    expect(event.notes[0].midi).toBe(67);
  });
  it("preserves pasted sentence breaks and instrumentals in other songs and through a JSON roundtrip", () => {
    const events = applyLyrics(BUILT_INS[2].events, "把每次敲击都\n变成小小旋律");
    expect(lyricsWithLines(events)).toBe("把每次敲击都\n变成小小旋律");
    const lines = scoreLines(JSON.parse(JSON.stringify({ events })));
    expect(lines.filter(line => !line.instrumental).map(line => line.text)).toEqual(["把每次敲击都", "变成小小旋律"]);
    expect(lines.filter(line => line.instrumental)).toHaveLength(3);
  });
  it("falls back to score rests when an older imported song has no sentence markers", () => {
    const events = BUILT_INS[1].events.map((event, i) => ({ ...event, start: event.start + (i > 5 ? 2 : 0) }));
    expect(scoreLines({ events }).map(line => line.text)).toEqual(["把每次敲击都", "变成小小旋律"]);
    expect(scoreLines(BUILT_INS[1]).map(line => line.text)).toEqual(["把每次敲击都变成小小旋律"]);
  });
});
