import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { BUILT_INS, validSong } from './music';
import { guidedSong, isInstrumental } from './performance';
import { scoreLines } from './guidance';

const song = BUILT_INS.find(song => song.id === 'chengdu-full');
describe('成都完整曲谱', () => {
  it('ships a validated full song and its exact source image and export', () => {
    expect(validSong(song)).toBe(true);
    expect(song).toEqual(JSON.parse(readFileSync('public/songs/chengdu-full.json', 'utf8')));
    const bytes = readFileSync('public/scores/chengdu.jpg');
    expect(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'))
      .toBe('cc447b5755b7dc1acefbf45c13b3144e93fe1a70');
    expect(song.events.filter(event => event.lyric)).toHaveLength(334);
    expect(song.durationBeats).toBe(399.5);
    expect(song.events.flatMap(event => event.notes)).toHaveLength(520);
  });
  it('unfolds all five lyric passes with the correct alternate verse, D.C., D.S. and final ending', () => {
    const sections = song.sections.map((section, i) => ({ label: section.label,
      text: song.events.slice(section.eventIndex, song.sections[i+1]?.eventIndex).map(event => event.lyric).join('') }));
    expect(sections.map(section => section.label)).toEqual(['前奏','主歌 1','主歌 2','副歌 1','间奏','主歌 3','副歌 2','合唱副歌','童声副歌','尾奏']);
    expect(sections[1].text).toMatch(/^让我掉下眼泪的/);
    expect(sections[1].text).toMatch(/让我感到为难的是挣扎的自由$/);
    expect(sections[1].text).toContain('你攥着我的手');
    expect(sections[2].text).toBe(sections[5].text);
    expect(sections[2].text).toContain('在那座阴雨的小城里我从未忘记你');
    expect(sections[2].text).toMatch(/成都带不走的只有你$/);
    expect(sections[3].text).toBe(sections[7].text);
    expect(sections[3].text).toMatch(/坐在小酒馆的门口$/);
    expect(sections[6].text).toBe(sections[8].text);
    expect(sections[6].text).toMatch(/也不停留$/);
    expect(scoreLines(guidedSong(song)).filter(line => !line.instrumental)).toHaveLength(39);
  });
  it('keeps every source onset through manual segmentation, including grace notes and sustained ties', () => {
    const prepared = guidedSong(song);
    const timeline = score => score.events.flatMap(event => event.notes.map(note =>
      [event.start + note.offset, note.midi, note.duration]));
    expect(timeline(prepared)).toEqual(timeline(song));
    expect(prepared.events.every(event => !event.auto)).toBe(true);
    const firstTwoLines = scoreLines(prepared).slice(0, 2);
    expect(firstTwoLines[0].items).toHaveLength(1);
    expect(firstTwoLines[0].items[0].event.notes[0].midi).toBe(66);
    expect(firstTwoLines[1].items.map(item => item.event.notes[0].midi)).toEqual([69,69,69,66,69]);
    const passages = song.events.filter(isInstrumental);
    expect(passages.map(event => event.section)).toEqual(['前奏','间奏','尾奏']);
    expect(passages[2].start + passages[2].duration).toBe(song.durationBeats);
    expect(passages[2].notes.at(-1).midi).toBe(62);
    expect(song.events.find(event => event.lyric === '让')).toMatchObject({ initial: 'R', start: 27 });
    const citySection = song.sections.find(section => section.label === '主歌 2');
    const city = song.events.slice(citySection.eventIndex).find(event => event.lyric === '城');
    expect(city.notes.map(note => note.midi)).toEqual([71,74]);
    const word = song.events.find(event => event.lyric === '口');
    expect(word.notes).toEqual([{ midi:69, duration:5.5, offset:0 }]);
    for (const event of song.events) for (const note of event.notes) {
      expect(note.offset + note.duration).toBeLessThanOrEqual(event.duration);
      expect(note.duration).toBeGreaterThan(0);
    }
  });
});
