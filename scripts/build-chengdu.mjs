import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pinyin } from 'pinyin-pro';

// Audited transcription of the pinned image. Navigation is explicit because
// the five lyric passes, D.C., D.S. and alternate endings are not linear OCR.
const source = JSON.parse(await readFile(new URL('./scores/chengdu-source.json', import.meta.url), 'utf8'));
const imagePath = new URL('../public/scores/chengdu.jpg', import.meta.url);
const image = await readFile(imagePath);
const blob = createHash('sha1').update(`blob ${image.length}\0`).update(image).digest('hex');
if (blob !== source.sourceBlob) throw new Error('Chengdu source image does not match the pinned Git blob.');
const scale = [0, 0, 2, 4, 5, 7, 9, 11];
const midi = (degree, octave = 0) => source.baseMidi + scale[degree] + octave * 12;
const ref = (row, index) => ({ ...source.rows[row][index], source: [row, index] });
const range = (row, start = 0, end = source.rows[row].length) =>
  Array.from({ length: end - start }, (_, i) => ref(row, start + i));
const alternate = source.alternateVerse.map((note, index) => ({ ...note, source: ['alternate', index] }));
const sections = [], events = [];
let time = 0;

function sounds(entry) {
  if (!entry.degree) return [];
  const result = [];
  let offset = 0;
  for (const [degree, octave] of entry.grace || []) {
    result.push({ midi: midi(degree, octave), duration: .0625, offset });
    offset += .0625;
  }
  result.push({ midi: midi(entry.degree, entry.octave), duration: entry.duration - offset, offset });
  return result;
}
function instrumental(label, entries) {
  const start = time, notes = [];
  let previous;
  for (const entry of entries) {
    if (entry.tieStop && previous?.entry.tieStart && !entry.grace?.length &&
      previous.note.midi === midi(entry.degree, entry.octave)) {
      previous.note.duration += entry.duration;
      previous.entry = entry;
    } else {
      for (const note of sounds(entry)) {
        const added = { ...note, offset: time - start + note.offset };
        notes.push(added);
        previous = { entry, note: added };
      }
    }
    time += entry.duration;
  }
  sections.push({ label, start, eventIndex: events.length });
  events.push({ lyric: '', initial: 'A', kind: 'instrumental', section: label,
    auto: false, inferred: false, pickupBeats: .5, start, duration: time - start, notes });
}
function vocals(label, entries, lane) {
  sections.push({ label, start: time, eventIndex: events.length });
  const boundaries = new Set(source.phraseStarts[lane].map(point => point.join(':')));
  let current, previous;
  for (const entry of entries) {
    const lyric = entry.word ?? entry.lyrics?.[lane] ?? '';
    if (lyric) {
      current = { lyric, initial: pinyin(lyric, { pattern: 'first', toneType: 'none' }).toUpperCase(),
        kind: 'vocal', section: label, start: time, duration: entry.duration, notes: [],
        ...(!current || boundaries.has(entry.source.join(':')) ? { lineStart: true } : {}) };
      events.push(current);
    }
    if (entry.degree) {
      if (!current) throw new Error(`Unattached note in ${label}`);
      if (!lyric && entry.tieStop && previous?.entry.tieStart && !entry.grace?.length &&
        previous.note.midi === midi(entry.degree, entry.octave)) {
        previous.note.duration += entry.duration;
        previous.entry = entry;
      } else {
        for (const note of sounds(entry)) {
          const added = { ...note, offset: time - current.start + note.offset };
          current.notes.push(added);
          previous = { entry, note: added };
        }
      }
      current.duration = time + entry.duration - current.start;
    }
    time += entry.duration;
  }
}

instrumental('前奏', [...range(0), ...range(1, 0, 13)]);
vocals('主歌 1', [...range(1, 13), ...range(2), ...range(3), ...range(4, 0, 3)], 'verse1');
const verseTwo = pickup => [pickup, ...range(1, 14), ...range(2), ...alternate, ...range(4, 4, 15)];
vocals('主歌 2', verseTwo({ ...ref(4, 3), word: '分' }), 'verse2');
const chorus = full => [...range(4, 15), ...range(5), ...range(6, 0, full ? undefined : 3),
  ...(full ? range(7, 0, 14) : [])];
vocals('副歌 1', chorus(true), 'chorus');
instrumental('间奏', [...range(7, 14), ...range(8), ...range(9, 0, 23)]);
vocals('主歌 3', verseTwo({ ...ref(9, 23), word: '分' }), 'verse2');
vocals('副歌 2', chorus(false), 'chorus');
vocals('合唱副歌', chorus(true), 'chorus');
vocals('童声副歌', chorus(false), 'chorus');
instrumental('尾奏', source.outro);

const song = {
  id: 'chengdu-full', title: '成都', artist: '赵雷', bpm: 90, tag: '全曲简谱',
  source: 'Flame-shi/musical-notation · 成都.jpg · 孟航制谱 · D 调旋律简谱',
  sourcePath: '成都.jpg',
  sourceUrl: 'https://github.com/Flame-shi/musical-notation/blob/d270cf5f912225d8e9ac016e8a7a2a0299204f56/%E6%88%90%E9%83%BD.jpg',
  scoreImage: '/scores/chengdu.jpg', key: 'D', beatsPerMeasure: 3, durationBeats: time,
  edition: '孟航制谱，1=D、3/4。按谱中五遍歌词、反复、D.C.、D.S. 和不同结尾展开，含前奏、间奏与尾奏；合唱和童声段均以同一钢琴音色演奏。此版为单旋律简谱，没有双手伴奏。装饰音占用主音前的短时值，延长记号由手动练习控制；90 BPM 为可调整的练习速度。',
  sections, events,
};
for (const event of events) {
  if (!event.notes.length || !/^[A-Z]$/.test(event.initial)) throw new Error('Invalid song event');
  for (const note of event.notes) {
    if (note.duration <= 0 || note.offset < 0 || note.offset + note.duration > event.duration)
      throw new Error(`Invalid timing at ${event.start}`);
  }
}
await writeFile(new URL('../src/data/chengdu-full.json', import.meta.url), JSON.stringify(song) + '\n');
await copyFile(new URL('../src/data/chengdu-full.json', import.meta.url), new URL('../public/songs/chengdu-full.json', import.meta.url));
console.log(JSON.stringify({ beats: time, vocalKeys: events.filter(event => event.lyric).length,
  notes: events.flatMap(event => event.notes).length, phrases: events.filter(event => event.lineStart).length, sections }, null, 2));
