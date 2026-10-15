import { KEY_PITCHES } from "./music";
export const isInstrumental = (event) =>
  event?.kind === "instrumental";

export function keyForPitch(midi) {
  return Object.entries(KEY_PITCHES)
    .filter(([, pitch]) => ((pitch - midi) % 12 + 12) % 12 === 0)
    .sort((a, b) => Math.abs(a[1] - midi) - Math.abs(b[1] - midi))[0]?.[0] || "A";
}

// Keep the saved score intact. At play time each instrumental onset becomes a
// guided keypress; simultaneous notes remain one chord with their real durations.
export function guidedSong(song) {
  const events = [], indexes = [];
  const beats = Number(song.beatsPerMeasure) > 0 ? Number(song.beatsPerMeasure) : 4;
  for (const [sourceIndex, event] of song.events.entries()) {
    indexes[sourceIndex] = events.length;
    if (!isInstrumental(event) || event.guided) {
      events.push(event);
      continue;
    }
    const groups = [];
    for (const note of [...event.notes].sort((a, b) => a.offset - b.offset)) {
      let group = groups.at(-1);
      if (!group || Math.abs(group.offset - note.offset) > 0.00001) {
        group = { offset: note.offset, notes: [] };
        groups.push(group);
      }
      group.notes.push({ ...note, offset: 0 });
    }
    const parts = [];
    const pickup = Number.isFinite(event.pickupBeats) && event.pickupBeats > 0 && event.pickupBeats < beats ? event.pickupBeats : 0;
    for (const group of groups) {
      const bar = pickup && group.offset + 0.00001 < pickup ? 0 :
        Math.floor((group.offset - pickup + 0.00001) / beats) + (pickup ? 1 : 0);
      let part = parts.at(-1);
      if (!part || part.bar !== bar || part.groups.length >= 12) {
        part = { bar, groups: [] };
        parts.push(part);
      }
      part.groups.push(group);
    }
    for (const [partIndex, part] of parts.entries())
      for (const [stepIndex, group] of part.groups.entries()) {
        const next = groups[groups.indexOf(group) + 1]?.offset ?? event.duration;
        events.push({ ...event, lyric: "", auto: false, guided: true, lineStart: false,
          initial: keyForPitch(Math.max(...group.notes.map(note => note.midi))),
          start: event.start + group.offset,
          duration: Math.max(next - group.offset, ...group.notes.map(note => note.duration)),
          notes: group.notes,
          guidePassage: sourceIndex, guidePart: partIndex + 1, guideParts: parts.length,
          guideStep: stepIndex + 1, guideSteps: part.groups.length,
        });
      }
  }
  indexes[song.events.length] = events.length;
  return { ...song, events, sections: song.sections?.map(section => ({ ...section, eventIndex: indexes[section.eventIndex] })) };
}
export function keyAction({
  key,
  mode,
  event,
  preview = false,
  automatic = false,
  octave = 0,
}) {
  const fixed = KEY_PITCHES[key];
  const fixedMode =
    mode === "free" || preview || automatic || !event || (isInstrumental(event) && !event.guided);
  if (
    !fixedMode &&
    (key === event.initial || (mode === "any" && fixed !== undefined))
  )
    return { type: "melody" };
  if (fixed === undefined) return null;
  return { type: "note", midi: fixed + 12 * octave };
}
export function instrumentalSpan(events, index) {
  const first = events[index];
  if (!isInstrumental(first)) return null;
  let end = index;
  while (end < events.length && isInstrumental(events[end])) end++;
  const duration = Math.max(
    ...events.slice(index, end).map((e) => e.start - first.start + e.duration),
  );
  // Preserve a rest before the next vocal event too.
  return {
    start: index,
    end,
    duration: Math.max(duration, (events[end]?.start ?? 0) - first.start),
  };
}
