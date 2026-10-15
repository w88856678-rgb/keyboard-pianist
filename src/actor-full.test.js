import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BUILT_INS, validSong } from "./music";
import { isInstrumental } from "./performance";

const song = BUILT_INS.find(s => s.id === "actor-full");
describe("演员全曲编排", () => {
  it("ships the same playable full score as the export, instead of the three-word opening", () => {
    expect(song).toEqual(JSON.parse(readFileSync("public/songs/actor-full.json", "utf8")));
    expect(validSong(song)).toBe(true);
    expect(BUILT_INS.some(s => s.id === "actor-opening")).toBe(false);
    expect(song.events.filter(e => e.lyric)).toHaveLength(468);
    expect(song.durationBeats).toBe(396);
  });
  it("unfolds the different verse lyrics and D.S. into a single complete performance", () => {
    const sections = song.sections.map((s, i) => ({
      label: s.label,
      text: song.events.slice(s.eventIndex, song.sections[i+1]?.eventIndex).map(e => e.lyric).join(""),
    }));
    expect(sections.map(s => s.label)).toEqual(["前奏", "主歌 1", "副歌 1", "主歌 2", "副歌 2", "桥段", "最后副歌", "尾奏"]);
    expect(sections[1].text).toMatch(/^简单点/);
    expect(sections[3].text).toContain("你想怎样我都随便");
    expect(sections[2].text).toContain("才是考验");
    expect(sections[4].text).toContain("都有了期限");
    expect(sections[5].text).toContain("其实说分不开的也不见得");
    expect(sections[6].text).toContain("我尽力在表演");
    expect(sections[6].text).toMatch(/这种成全$/);
  });
  it("keeps the real instrumental passages, rests and final release inside the song span", () => {
    const intro = song.events[0], outro = song.events.at(-1);
    expect(isInstrumental(intro)).toBe(true);
    expect(intro.duration).toBe(30.5);
    expect(song.events[1]).toMatchObject({lyric:"简", initial:"J", start:30.5});
    expect(isInstrumental(outro)).toBe(true);
    expect(outro.start + outro.duration).toBe(396);
    for (const [i, event] of song.events.entries()) {
      expect(event.start).toBeGreaterThanOrEqual(i ? song.events[i-1].start : 0);
      expect(event.notes.length).toBeGreaterThan(0);
      for (const note of event.notes) {
        expect(note.duration).toBeGreaterThan(0);
        expect(note.offset).toBeGreaterThanOrEqual(0);
        expect(note.offset + note.duration).toBeLessThanOrEqual(event.duration);
      }
    }
  });
});
