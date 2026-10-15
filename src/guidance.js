import { pitchName } from "./music";
import { isInstrumental } from "./performance";

// Notes at the same onset sound together; later onsets are played in order.
export function noteSteps(event) {
  const steps = [];
  for (const note of [...event.notes].sort((a, b) => a.offset - b.offset)) {
    let step = steps.at(-1);
    if (!step || Math.abs(step.offset - note.offset) > 0.00001) {
      step = { offset: note.offset, pitches: [] };
      steps.push(step);
    }
    if (!step.pitches.includes(note.midi)) step.pitches.push(note.midi);
  }
  return steps.map(step => ({ ...step, text: step.pitches.map(pitchName).join(" + ") }));
}
export const noteSequence = event => noteSteps(event).map(step => step.text).join(" → ");

// Explicit sentence boundaries take priority. Older scores fall back to rests,
// punctuation and section changes, without cutting a phrase every few letters.
export function scoreLines(song) {
  const explicit = song.events.some(event => !isInstrumental(event) && event.lineStart);
  const sections = new Map((song.sections || []).map(section => [section.eventIndex, section.label]));
  const lines = [];
  let section = "", previous, line;
  for (const [index, event] of song.events.entries()) {
    if (sections.has(index)) section = sections.get(index);
    const instrumental = isInstrumental(event);
    const instrumentalBoundary = instrumental && (!event.guided ||
      event.guidePassage !== previous?.guidePassage || event.guidePart !== previous?.guidePart);
    const boundary = !line || instrumental !== line.instrumental || instrumentalBoundary || event.lineStart || sections.has(index) ||
      (!instrumental && !explicit && previous && (
        event.start - previous.start - previous.duration >= 0.45 ||
        /[，。！？；,.!?;\n]$/.test(previous.lyric || "")
      ));
    if (boundary) {
      line = { start: index, section: instrumental ? event.section || "器乐段" : section,
        part: event.guidePart, parts: event.guideParts, instrumental, items: [] };
      lines.push(line);
    }
    line.items.push({ event, index, steps: noteSteps(event), notes: noteSequence(event) });
    previous = event;
  }
  let number = 0;
  return lines.map(line => ({ ...line, number: line.instrumental ? null : ++number, end: line.items.at(-1).index,
    text: line.items.map(item => item.event.lyric || "♪").join("") }));
}

export function lyricsWithLines(events) {
  return events.filter(event => event.lyric).map((event, index) =>
    `${index && event.lineStart ? "\n" : ""}${event.lyric}`,
  ).join("");
}
