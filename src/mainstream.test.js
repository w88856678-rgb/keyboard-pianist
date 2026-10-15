import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import songs from './data/mainstream';
import { BUILT_INS, validSong } from './music';
import { SCORE_CATALOG, searchCatalog } from './catalog';
import { guidedSong } from './performance';
import { scoreLines } from './guidance';

const lyric = song => song.events.map(e=>e.lyric).join('');
const sectionText = (song,label) => {
  const i=song.sections.findIndex(s=>s.label===label);
  return song.events.slice(song.sections[i].eventIndex,song.sections[i+1]?.eventIndex).map(e=>e.lyric).join('');
};
const timeline = song => song.events.flatMap(e=>e.notes.map(n=>[e.start+n.offset,n.midi,n.duration]));
const endings=['在说我愿意','她会有多幸运','有一个男孩爱着那个女孩','也为别人而流','好久不见','目光所致也是你','却依然相信彩虹','看云淡风轻','我的故事还是关于你呀','我也希望变更好'];
describe('新增十首曲库旋律谱',()=> {
  it('adds ten distinct playable scores without replacing either existing full song',()=> {
    expect(songs).toHaveLength(10);
    expect(new Set(songs.map(s=>s.id)).size).toBe(10);
    expect(BUILT_INS.filter(s=>s.tag==='全曲简谱')).toHaveLength(12);
    expect(BUILT_INS.some(s=>s.id==='actor-full')).toBe(true);
    expect(BUILT_INS.some(s=>s.id==='chengdu-full')).toBe(true);
  });
  for (const [i,song] of songs.entries()) it(`${song.title} has a complete playable timeline, source, export, search and sentence guide`,()=> {
    expect(validSong(song)).toBe(true);
    expect(BUILT_INS).toContain(song);
    expect(song).toEqual(JSON.parse(readFileSync(`public/songs/${song.id}.json`,'utf8')));
    const bytes=readFileSync(`public${song.scoreImage}`);
    expect(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')).toBe(song.sourceBlob);
    expect(song.sourceBlob).toBe(SCORE_CATALOG.find(s=>s.path===song.sourcePath).sha);
    for (const query of [song.title,`${song.artist} ${song.title}`])
      expect(searchCatalog(SCORE_CATALOG,query).some(s=>s.path===song.sourcePath)).toBe(true);
    expect(lyric(song).endsWith(endings[i])).toBe(true);
    expect(lyric(song)).not.toMatch(/欢迎|制谱|交流群|光临|QQ群|注反复|幺|蠻|膩/);
    const prepared=guidedSong(song);
    expect(timeline(prepared)).toEqual(timeline(song));
    expect(prepared.events.every(e=>!e.auto)).toBe(true);
    expect(scoreLines(prepared).every(line=>line.instrumental?line.items.length<=12:line.items.length<=24)).toBe(true);
    let previous=-1;
    for(const e of song.events) {
      expect(e.start).toBeGreaterThanOrEqual(previous);previous=e.start;
      expect(e.duration).toBeGreaterThan(0);
      for(const n of e.notes) {
        expect(n.offset+n.duration).toBeLessThanOrEqual(e.duration+1e-7);
        expect(n.midi).toBeGreaterThanOrEqual(21);expect(n.midi).toBeLessThanOrEqual(108);
      }
    }
    const last=song.events.at(-1);
    expect(last.start+last.duration).toBeLessThanOrEqual(song.durationBeats+1e-7);
  });
  it('unfolds alternate lyrics, endings and the final transposition',()=> {
    const byId=id=>songs.find(s=>s.id===`${id}-full`);
    expect(sectionText(byId('lucky'),'主歌 1')).toContain('爱上你的时候');
    expect(sectionText(byId('lucky'),'主歌 2')).toContain('青春是段跌跌撞撞的旅行');
    expect(sectionText(byId('warm'),'主歌 2')).toMatch(/^都可以随便的/);
    expect(sectionText(byId('warm'),'尾声副歌')).toContain('从来都很低调自信心不高');
    expect(sectionText(byId('chaser'),'主歌 2')).toMatch(/^如果说你是夏夜的萤火/);
    const chaser=byId('chaser');
    const chorus1=chaser.events[chaser.sections.find(s=>s.label==='副歌 1').eventIndex];
    const chorus3=chaser.events[chaser.sections.find(s=>s.label==='升调副歌').eventIndex];
    expect(chorus3.notes[0].midi).toBe(chorus1.notes[0].midi+1);
    expect(byId('ten-years').beatsPerMeasure).toBe(2);
    expect(byId('rest-of-life').edition).toContain('补成两个可按字');
    expect(sectionText(byId('long-time'),'副歌 2')).toBe(sectionText(byId('long-time'),'副歌 1'));
  });
});
