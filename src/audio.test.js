import { beforeAll, afterEach, describe, it, expect, vi } from "vitest";
const spies = vi.hoisted(() => ({
  attack: vi.fn(),
  release: vi.fn(),
  all: vi.fn(),
}));
vi.mock("tone", () => ({
  start: async () => {},
  now: () => 0,
  getContext: () => ({ state: "running" }),
  Sampler: class {
    constructor(options) {
      this.loaded = true;
      this.volume = { value: 0 };
      queueMicrotask(options.onload);
    }
    toDestination() {
      return this;
    }
    triggerAttack(...args) {
      spies.attack(...args);
    }
    triggerRelease(...args) {
      spies.release(...args);
    }
    releaseAll() {
      spies.all();
    }
  },
}));
import * as audio from "./audio";
beforeAll(async () => {
  await audio.prepareAudio();
});
afterEach(() => {
  audio.stopAudio();
  vi.useRealTimers();
  vi.clearAllMocks();
});
describe("polyphonic and transport audio", () => {
  it("holds simultaneous notes and releases each key independently", () => {
    const a = audio.attackPitch(60),
      b = audio.attackPitch(64);
    expect(spies.attack.mock.calls.map((c) => c[0])).toEqual(["C4", "E4"]);
    audio.releasePitch(a);
    expect(spies.release).toHaveBeenCalledWith("C4", 0);
    expect(spies.release).not.toHaveBeenCalledWith("E4", 0);
    audio.releasePitch(b);
    expect(spies.release).toHaveBeenCalledWith("E4", 0);
  });
  it("does not cut a held key when a melody note of the same pitch finishes", () => {
    vi.useFakeTimers();
    const held = audio.attackPitch(60);
    audio.playEvent({ notes: [{ midi: 60, offset: 0, duration: 1 }] }, 120);
    vi.advanceTimersByTime(600);
    expect(spies.release).not.toHaveBeenCalled();
    audio.releasePitch(held);
    expect(spies.release).toHaveBeenCalledWith("C4", 0);
  });
  it("defers note release until the sustain pedal is lifted", () => {
    audio.sustain(true);
    const held = audio.attackPitch(60);
    audio.releasePitch(held);
    expect(spies.release).not.toHaveBeenCalled();
    audio.sustain(false);
    expect(spies.release).toHaveBeenCalledWith("C4", 0);
  });
  it("cancels future instrumental notes and callbacks on reset", () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    audio.playEvent({ notes: [{ midi: 60, offset: 3, duration: 1 }] }, 120);
    audio.later(callback, 1000);
    audio.stopAudio();
    vi.advanceTimersByTime(2000);
    expect(spies.attack).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
  });
});
