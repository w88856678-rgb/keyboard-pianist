import * as Tone from "tone";
import { pitchName } from "./music";
let sampler, loading;
const timers = new Set();
let sustained = false;
const held = new Set();
const voices = new Map();
export const isReady = () =>
  !!sampler?.loaded && Tone.getContext().state === "running";
export async function prepareAudio() {
  await Tone.start();
  if (!sampler) {
    loading = new Promise((resolve, reject) => {
      sampler = new Tone.Sampler({
        urls: {
          C3: "C3.mp3",
          "D#3": "Ds3.mp3",
          "F#3": "Fs3.mp3",
          A3: "A3.mp3",
          C4: "C4.mp3",
          "D#4": "Ds4.mp3",
          "F#4": "Fs4.mp3",
          A4: "A4.mp3",
          C5: "C5.mp3",
          "D#5": "Ds5.mp3",
          "F#5": "Fs5.mp3",
          A5: "A5.mp3",
          C6: "C6.mp3",
        },
        baseUrl: `${import.meta.env.BASE_URL}audio/`,
        release: 1.6,
        onload: resolve,
        onerror: reject,
      }).toDestination();
    });
  }
  await loading;
}
export function volume(value) {
  if (sampler)
    sampler.volume.value =
      value === 0 ? -Infinity : 20 * Math.log10(value / 100) - 3;
}
export function later(fn, ms) {
  const id = setTimeout(
    () => {
      timers.delete(id);
      fn();
    },
    Math.max(0, ms),
  );
  timers.add(id);
  return id;
}
function attack(midi, velocity = 0.75) {
  if (!sampler?.loaded) return null;
  const pitch = pitchName(midi),
    token = { pitch, midi };
  if (!voices.has(pitch)) voices.set(pitch, new Set());
  voices.get(pitch).add(token);
  held.delete(pitch);
  sampler.triggerAttack(pitch, Tone.now(), velocity);
  return token;
}
export function releasePitch(token) {
  if (!token) return;
  const active = voices.get(token.pitch);
  if (!active?.delete(token) || active.size) return;
  voices.delete(token.pitch);
  if (sustained) held.add(token.pitch);
  else sampler?.triggerRelease(token.pitch, Tone.now());
}
export const attackPitch = (midi) => attack(midi);
export function playEvent(event, bpm, onNote = () => {}) {
  const beat = 60000 / bpm;
  for (const note of event.notes)
    later(() => {
      const token = attack(note.midi, note.velocity ?? 0.75);
      if (!token) return;
      onNote(note.midi);
      later(() => releasePitch(token), note.duration * beat * 0.94);
    }, note.offset * beat);
}
export function playPitch(midi) {
  const token = attack(midi);
  if (token) later(() => releasePitch(token), 650);
  return token;
}
export function sustain(value) {
  sustained = value;
  if (!value && sampler) {
    for (const pitch of held)
      if (!voices.has(pitch)) sampler.triggerRelease(pitch, Tone.now());
    held.clear();
  }
}
export function stopAudio() {
  for (const id of timers) clearTimeout(id);
  timers.clear();
  voices.clear();
  held.clear();
  sustained = false;
  sampler?.releaseAll();
}
