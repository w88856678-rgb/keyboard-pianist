// @vitest-environment jsdom
import React, { act } from "react";
import { readFileSync } from "node:fs";
import { createRoot } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { App } from "./App";
import * as audio from "./audio";
import { BUILT_INS } from "./music";
import { guidedSong, isInstrumental } from "./performance";
import { TUTORIAL_STORAGE } from "./Onboarding";
vi.mock("./audio", () => ({
  isReady: () => true,
  prepareAudio: vi.fn(async () => {}),
  volume: vi.fn(),
  stopAudio: vi.fn(),
  sustain: vi.fn(),
  attackPitch: vi.fn((midi) => ({ midi, pitch: String(midi) })),
  releasePitch: vi.fn(),
  playPitch: vi.fn(),
  playEvent: vi.fn(),
  later: vi.fn((fn, ms) => setTimeout(fn, ms)),
}));
let host, root;
const key = (type, value, extra = {}) =>
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent(type, { key: value, bubbles: true, ...extra }),
    );
  });
const button = (label) => host.querySelector(`[aria-label="${label}"]`);
const textButton = text => [...host.querySelectorAll('button')].find(b => b.textContent.trim() === text);
const press = value => { key('keydown', value.toLowerCase()); key('keyup', value.toLowerCase()); };
function chooseSong(title) {
  act(() => button("打开我的曲库").click());
  act(() => [...host.querySelectorAll(".song-item")].find(b => b.textContent.includes(title)).click());
}
function seekSection(label) {
  const section = host.querySelector('#song-section');
  act(() => {
    section.focus();
    section.value = [...section.options].find(option => option.text === label).value;
    section.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  });
  localStorage.clear();
  localStorage.setItem(TUTORIAL_STORAGE, "done");
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<App />));
  vi.clearAllMocks();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("beginner tutorial", () => {
  function freshVisit() {
    act(() => root.render(null));
    localStorage.removeItem(TUTORIAL_STORAGE);
    act(() => root.render(<App />));
    vi.clearAllMocks();
  }
  it("appears on first visit, plays three independent practice notes and remembers completion", async () => {
    freshVisit();
    expect(host.querySelector('dialog[aria-label="新手教程"][open]')).toBeTruthy();
    expect(host.querySelector('.tutorial-key.current').textContent).toContain('A');
    press('X');
    expect(audio.playPitch).toHaveBeenLastCalledWith(50);
    expect(host.querySelectorAll('.tutorial-key.complete')).toHaveLength(0);
    press('A');
    press('A');
    press('S');
    press('D');
    expect(audio.playPitch.mock.calls.map(([midi]) => midi)).toEqual([50, 60, 60, 62, 64]);
    expect(host.querySelectorAll('.tutorial-key.complete')).toHaveLength(3);
    expect(audio.playEvent).not.toHaveBeenCalled();
    expect(host.querySelector('.segment-progress').textContent).toContain('0 / 7');
    act(() => textButton('学会了，下一步').click());
    expect(host.querySelector('.tutorial-song-example').textContent).toContain('F#3');
    press('W');
    expect(audio.playEvent).not.toHaveBeenCalled();
    act(() => textButton('进入琴房').click());
    expect(localStorage.getItem(TUTORIAL_STORAGE)).toBe('done');
    expect(host.querySelector('.tutorial-dialog')).toBeNull();
    press('W');
    expect(host.querySelector('.segment-progress').textContent).toContain('1 / 7');
    act(() => root.render(null));
    act(() => root.render(<App />));
    expect(host.querySelector('.tutorial-dialog')).toBeNull();
  });
  it("allows skipping immediately or with Escape and reopens without losing the current phrase", () => {
    freshVisit();
    act(() => textButton('跳过教程').click());
    expect(localStorage.getItem(TUTORIAL_STORAGE)).toBe('done');
    seekSection('主歌 1');
    press('J');
    expect(host.querySelector('.melody-tools').textContent).toContain('1 / 468');
    act(() => textButton('新手教程').click());
    expect(host.querySelector('.tutorial-dialog')).toBeTruthy();
    press('D');
    expect(host.querySelector('.melody-tools').textContent).toContain('1 / 468');
    act(() => host.querySelector('.tutorial-dialog').dispatchEvent(new Event('cancel', { cancelable: true })));
    expect(host.querySelector('.tutorial-dialog')).toBeNull();
    expect(host.querySelector('.next-cue').textContent).toContain('D→ E4');
    press('D');
    expect(host.querySelector('.melody-tools').textContent).toContain('2 / 468');
  });
  it("cancels a pending tutorial audio load on skip without playing a late note", async () => {
    freshVisit();
    const readiness = vi.spyOn(audio, 'isReady').mockReturnValueOnce(false);
    let finishLoading;
    audio.prepareAudio.mockImplementationOnce(() => new Promise(resolve => { finishLoading = resolve; }));
    press('A');
    expect(host.querySelector('.tutorial-feedback').textContent).toContain('正在准备');
    act(() => textButton('跳过教程').click());
    await act(async () => finishLoading());
    expect(audio.playPitch).not.toHaveBeenCalled();
    expect(audio.playEvent).not.toHaveBeenCalled();
    expect(host.querySelector('.segment-progress').textContent).toContain('0 / 7');
    readiness.mockRestore();
  });
});
describe("product flow regressions", () => {
  it("preserves the current phrase and manual cursor when search, import or about are cancelled", () => {
    seekSection('主歌 1');
    press('J');
    const checkPosition = () => {
      expect(host.querySelector('.segment-progress').textContent).toContain('1 / 3');
      expect(host.querySelector('.next-cue').textContent).toContain('D→ E4');
    };
    act(() => button('搜索歌曲与乐谱').click());
    act(() => button('关闭搜索').click());
    checkPosition();
    act(() => textButton('导入乐谱').click());
    act(() => button('关闭导入').click());
    checkPosition();
    act(() => textButton('关于这间琴房').click());
    act(() => button('关闭关于').click());
    checkPosition();
  });
  it("cancels a preview from search and returns to the original manual key", async () => {
    press('W');
    await act(async () => textButton('试听本段').click());
    await act(async () => vi.advanceTimersByTimeAsync(800));
    act(() => button('搜索歌曲与乐谱').click());
    act(() => button('关闭搜索').click());
    expect(host.querySelector('.segment-progress').textContent).toContain('1 / 7');
    expect(host.querySelector('.next-cue').textContent).toContain('E→ F#3');
  });
  it("opens a selected song in guided mode after free play", () => {
    act(() => textButton('自由弹奏').click());
    chooseSong('成都');
    expect(textButton('跟歌弹奏').getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('.next-cue').textContent).toContain('E→ F#4');
    expect(button('调节节奏').textContent).toContain('90 BPM');
  });
  function pointer(element, type, pointerId = 1) {
    act(() => element.dispatchEvent(Object.assign(new Event(type, { bubbles: true, cancelable: true }), { pointerId })));
  }
  it("holds touch letter chords and releases each pointer without a second click note", () => {
    act(() => textButton('自由弹奏').click());
    pointer(button('按键 A'), 'pointerdown', 1);
    pointer(button('按键 S'), 'pointerdown', 2);
    expect(audio.attackPitch.mock.calls.map(([midi]) => midi)).toEqual([60, 62]);
    pointer(button('按键 A'), 'pointerup', 1);
    expect(audio.releasePitch).toHaveBeenCalledWith(expect.objectContaining({ midi: 60 }));
    expect(button('按键 S').classList.contains('pressed')).toBe(true);
    pointer(button('按键 S'), 'pointercancel', 2);
    expect(button('按键 S').classList.contains('pressed')).toBe(false);
    expect(audio.playPitch).not.toHaveBeenCalled();
  });
  it("holds and releases the touch piano in free mode", async () => {
    act(() => textButton('自由弹奏').click());
    const pianoKey = button('弹奏 C4');
    await act(async () => pointer(pianoKey, 'pointerdown', 4));
    expect(audio.attackPitch).toHaveBeenCalledWith(60);
    expect(pianoKey.classList.contains('lit')).toBe(true);
    pointer(pianoKey, 'pointercancel', 4);
    expect(audio.releasePitch).toHaveBeenCalledWith(expect.objectContaining({ midi: 60 }));
  });
  it("keeps native button activation and dismisses popovers with Escape", () => {
    const volume = button('调节音量');
    act(() => {
      volume.focus();
      volume.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(textButton('开始演奏')).toBeTruthy();
    act(() => volume.click());
    expect(host.querySelector('#volume')).toBeTruthy();
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(host.querySelector('#volume')).toBeNull();
  });
});
describe("physical keyboard integration", () => {
  it('plays the complete Chengdu score, including every guided instrumental onset and its final D4', () => {
    chooseSong('成都');
    const score = guidedSong(BUILT_INS.find(song => song.id === 'chengdu-full'));
    expect(host.querySelector('.score-line-heading').textContent).toContain('前奏');
    expect(host.querySelector('.next-cue').textContent).toContain('E→ F#4');
    for (const event of score.events) press(event.initial);
    expect(host.querySelector('.melody-tools').textContent).toContain('334 / 334');
    expect(host.querySelector('.finished').textContent).toContain('演奏完成');
    expect(audio.playEvent.mock.calls.flatMap(([event]) => event.notes)).toHaveLength(520);
    expect(audio.playEvent.mock.calls.at(-1)[0].notes[0].midi).toBe(62);
    expect(audio.playEvent.mock.calls.filter(([event]) => event.lyric)).toHaveLength(334);
  });
  it("keeps full sentences on screen and updates the same letter's note and last-played guidance", () => {
    seekSection('主歌 1');
    expect(host.querySelectorAll('.score-syllable')).toHaveLength(3);
    expect(host.querySelectorAll('.score-line')).toHaveLength(1);
    expect(host.querySelector('.next-cue').textContent).toContain('J→ F#3');
    key('keydown', 'j'); key('keyup', 'j');
    expect(host.querySelector('.next-cue').textContent).toContain('D→ E4');
    expect(host.querySelector('.played-note-feedback').textContent).toContain('J → F#3');
    key('keydown', 'd'); key('keyup', 'd');
    expect(host.querySelector('.next-cue').textContent).toContain('D→ D#4');
    expect(host.querySelector('.next-cue').textContent).toContain('→ D#4');
    key('keydown', 'd'); key('keyup', 'd');
    expect(host.querySelector('.current-line .sentence-notes').getAttribute('aria-label')).toBe('说话的方式简单点');
    expect(host.querySelectorAll('.score-syllable')).toHaveLength(8);
  });
  it("uses the shared guide for other songs and can restart a complete sentence", () => {
    chooseSong('原创练习曲');
    expect(host.querySelector('.sentence-notes').getAttribute('aria-label')).toBe('把每次敲击都变成小小旋律');
    expect(host.querySelector('.next-cue').textContent).toContain('B→ C4');
    key('keydown', 'b'); key('keyup', 'b');
    expect(host.querySelector('.next-cue').textContent).toContain('M→ E4');
    act(() => textButton('重弹这段').click());
    expect(host.querySelector('.next-cue').textContent).toContain('B→ C4');
    expect(host.querySelector('.melody-tools').textContent).toContain('0 / 12');
  });
  it("plays an extra held note without moving the song, then advances on the lyric initial", () => {
    seekSection('主歌 1');
    const section = host.querySelector('#song-section');
    expect(document.activeElement).not.toBe(section);
    key("keydown", "x");
    expect(audio.attackPitch).toHaveBeenCalledWith(50);
    expect(host.querySelector(".melody-tools").textContent).toContain("0 / 468");
    expect(button("按键 X").classList.contains("pressed")).toBe(true);
    key("keydown", "j");
    expect(audio.playEvent.mock.calls[0][0].lyric).toBe("简");
    expect(host.querySelector(".melody-tools").textContent).toContain("1 / 468");
    key("keyup", "x");
    expect(audio.releasePitch).toHaveBeenCalledWith(
      expect.objectContaining({ midi: 50 }),
    );
    expect(button("按键 X").classList.contains("pressed")).toBe(false);
  });
  it("starts a preview at the selected section, and opening the original score preserves the cursor", async () => {
    seekSection('桥段');
    const playedBefore = host.querySelector('.melody-tools').textContent.match(/\d+ \/ 468/)[0];
    await act(async () => textButton('试听本段').click());
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(audio.playEvent.mock.calls[0][0].lyric).toBe('其');
    act(() => [...host.querySelectorAll('button')].find(b => b.textContent.trim() === '查看原谱').click());
    expect(host.querySelector('.melody-tools').textContent).toContain(playedBefore);
    const count = audio.playEvent.mock.calls.length;
    key('keydown', 'q');
    expect(audio.playEvent).toHaveBeenCalledTimes(count);
    expect(host.querySelector('[aria-label="演员原谱与版本说明"]')).toBeTruthy();
    act(() => button('关闭原谱').click());
    expect(host.querySelector('#song-section').selectedOptions[0].text).toBe('桥段');
  });
  it("plays the entire Actor score by guided keys, including its intro and outro, without automatic passages", () => {
    for (const event of guidedSong(BUILT_INS[0]).events) press(event.initial);
    expect(host.querySelector('.melody-tools').textContent).toContain('468 / 468');
    expect(audio.playEvent.mock.calls.filter(([e]) => e.lyric)).toHaveLength(468);
    expect(host.querySelector('.finished').textContent).toContain('演奏完成');
    expect(audio.playEvent.mock.calls.at(-1)[0].section).toBe('尾奏');
    expect(audio.playEvent.mock.calls.flatMap(([event]) => event.notes)).toHaveLength(546);
  });
  it("keeps one guided instrumental bar until its final key, then moves to the next and supports replay", async () => {
    expect(host.querySelector('.score-line-heading').textContent).toContain('前奏 · 第 1 / 8 段');
    expect(host.querySelectorAll('.score-syllable')).toHaveLength(7);
    expect(host.querySelector('.next-cue').textContent).toContain('W→ D#3');
    press('X');
    expect(audio.attackPitch).toHaveBeenCalledWith(50);
    expect(host.querySelector('.segment-progress').textContent).toContain('0 / 7');
    const intro = guidedSong(BUILT_INS[0]).events.filter(isInstrumental).slice(0, 47);
    for (const event of intro.slice(0, 6)) press(event.initial);
    expect(host.querySelector('.score-line-heading').textContent).toContain('前奏 · 第 1 / 8 段');
    expect(host.querySelector('.segment-progress').textContent).toContain('6 / 7');
    press(intro[6].initial);
    expect(host.querySelector('.score-line-heading').textContent).toContain('前奏 · 第 2 / 8 段');
    const count = audio.playEvent.mock.calls.length;
    await act(async () => vi.advanceTimersByTimeAsync(60000));
    expect(audio.playEvent).toHaveBeenCalledTimes(count);
    press(intro[7].initial);
    act(() => textButton('重弹这段').click());
    expect(host.querySelector('.segment-progress').textContent).toContain('0 / 7');
    expect(host.querySelector('.score-line-heading').textContent).toContain('前奏 · 第 2 / 8 段');
    act(() => textButton('← 上一段').click());
    expect(host.querySelector('.score-line-heading').textContent).toContain('前奏 · 第 1 / 8 段');
  });
  it("previews only the current instrumental bar and restores the original manual position", async () => {
    press('W');
    await act(async () => textButton('试听本段').click());
    await act(async () => vi.advanceTimersByTimeAsync(10000));
    expect(audio.playEvent).toHaveBeenCalledTimes(8); // One manual onset plus seven preview onsets.
    expect(host.querySelector('.score-line-heading').textContent).toContain('前奏 · 第 1 / 8 段');
    expect(host.querySelector('.segment-progress').textContent).toContain('1 / 7');
    expect(host.querySelector('.next-cue').textContent).toContain('E→ F#3');
  });
  it("treats another song's interlude and final chord as manual guided sections", () => {
    chooseSong('器乐段练习');
    const score = guidedSong(BUILT_INS[2]);
    const interlude = score.events.findIndex(event => event.section === '间奏');
    for (const event of score.events.slice(0, interlude)) press(event.initial);
    expect(host.querySelector('.score-line-heading').textContent).toContain('间奏 · 第 1 / 1 段');
    expect(host.querySelectorAll('.score-syllable')).toHaveLength(4);
    const outro = score.events.findIndex(event => event.section === '尾奏');
    for (const event of score.events.slice(interlude, outro)) press(event.initial);
    expect(host.querySelector('.score-line-heading').textContent).toContain('尾奏 · 第 1 / 1 段');
    expect(host.querySelector('.next-cue').textContent).toContain('C3 + G3 + C4');
    press(score.events[outro].initial);
    expect(audio.playEvent.mock.calls.at(-1)[0].notes).toHaveLength(3);
    expect(host.querySelector('.finished').textContent).toContain('演奏完成');
  });
  it("holds a chord in free mode, ignores key repeat and releases each key independently", () => {
    act(() =>
      [...host.querySelectorAll("button")]
        .find((b) => b.textContent === "自由弹奏")
        .click(),
    );
    key("keydown", "a");
    key("keydown", "s");
    key("keydown", "s", { repeat: true });
    expect(audio.attackPitch.mock.calls.map((args) => args[0])).toEqual([
      60, 62,
    ]);
    expect(button("按键 A").classList.contains("pressed")).toBe(true);
    expect(button("按键 S").classList.contains("pressed")).toBe(true);
    key("keyup", "a");
    expect(button("按键 A").classList.contains("pressed")).toBe(false);
    expect(button("按键 S").classList.contains("pressed")).toBe(true);
    act(() => window.dispatchEvent(new Event("blur")));
    expect(audio.releasePitch).toHaveBeenCalledWith(
      expect.objectContaining({ midi: 62 }),
    );
    expect(button("按键 S").classList.contains("pressed")).toBe(false);
  });
});


describe("新增十首整曲演奏", () => {
  for (const song of BUILT_INS.slice(4)) it(`${song.title} can be played from its first key to its ending`, () => {
    chooseSong(song.title);
    expect(host.querySelector('.tempo-control small').textContent).toContain('90');
    const prepared=guidedSong(song);
    const other=prepared.events[0].initial === 'Q' ? 'W' : 'Q';
    press(other);
    expect(audio.playEvent).not.toHaveBeenCalled();
    for(const event of prepared.events) press(event.initial);
    expect(host.querySelector('.finished').textContent).toContain('演奏完成');
    expect(audio.playEvent.mock.calls.flatMap(([event]) => event.notes)).toHaveLength(song.events.flatMap(event=>event.notes).length);
    expect(audio.playEvent.mock.calls.filter(([event])=>event.lyric)).toHaveLength(song.events.filter(event=>event.lyric).length);
    expect(audio.playEvent.mock.calls.at(-1)[0].notes.at(-1).midi).toBe(song.events.at(-1).notes.at(-1).midi);
  });
});


describe("immersive stage library", () => {
  it("shows the entire playable library through the top entry and preserves progress on cancel", () => {
    seekSection('主歌 1');
    press('J');
    act(() => button('打开我的曲库').click());
    expect(host.querySelectorAll('.library-dialog .song-item')).toHaveLength(BUILT_INS.length);
    press('D');
    expect(host.querySelector('.segment-progress').textContent).toContain('1 / 3');
    expect(audio.stopAudio).toHaveBeenCalled();
    act(() => button('关闭曲库').click());
    expect(host.querySelector('.library-dialog')).toBeNull();
    press('D');
    expect(host.querySelector('.segment-progress').textContent).toContain('2 / 3');
  });
  it("cancels preview and restores the manual cursor when the library opens", async () => {
    press('W');
    await act(async () => textButton('试听本段').click());
    await act(async () => vi.advanceTimersByTimeAsync(800));
    act(() => button('打开我的曲库').click());
    act(() => host.querySelector('.library-dialog').dispatchEvent(new Event('cancel', { bubbles: true, cancelable: true })));
    expect(host.querySelector('.library-dialog')).toBeNull();
    expect(host.querySelector('.segment-progress').textContent).toContain('1 / 7');
    expect(host.querySelector('.next-cue').textContent).toContain('E→ F#3');
  });
  it("switches from the library to search or import without stacked dialogs or losing the cursor", () => {
    press('W');
    act(() => button('打开我的曲库').click());
    act(() => textButton('搜索歌曲与乐谱').click());
    expect(host.querySelector('.library-dialog')).toBeNull();
    expect(button('关闭搜索')).toBeTruthy();
    act(() => button('关闭搜索').click());
    expect(host.querySelector('.segment-progress').textContent).toContain('1 / 7');
    act(() => button('打开我的曲库').click());
    act(() => [...host.querySelectorAll('.library-dialog button')].find(b => b.textContent.trim() === '导入乐谱').click());
    expect(host.querySelector('.library-dialog')).toBeNull();
    expect(button('关闭导入')).toBeTruthy();
    act(() => button('关闭导入').click());
    expect(host.querySelector('.segment-progress').textContent).toContain('1 / 7');
  });
});


describe("stage imported-library persistence", () => {
  it("reads saved imported songs again after remount and selects them from the new library", () => {
    const saved = { ...BUILT_INS[1], id: 'stage-saved-fixture', title: '保留的导入歌曲' };
    act(() => root.render(null));
    localStorage.setItem('keyboard-pianist-songs-v1', JSON.stringify([saved]));
    act(() => root.render(<App />));
    chooseSong('保留的导入歌曲');
    expect(host.querySelector('.song-heading h2').textContent).toBe('保留的导入歌曲');
    expect(button('调节节奏').textContent).toContain('90 BPM');
    expect(JSON.parse(localStorage.getItem('keyboard-pianist-songs-v1'))[0].id).toBe(saved.id);
  });
  it("retains the reviewed score and previous cursor when browser storage rejects saving", async () => {
    press('W');
    act(() => textButton('导入乐谱').click());
    const xml = readFileSync('public/examples/little-melody.musicxml', 'utf8');
    const file = { name: 'stage-storage.musicxml', size: xml.length, arrayBuffer: async () => new TextEncoder().encode(xml).buffer };
    const input = host.querySelector('input[type="file"]');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    try {
      await act(async () => textButton('保存并演奏').click());
      expect(host.querySelector('[role="alert"]').textContent).toContain('尚未保存');
      expect(host.querySelector('.score-meta input').value).toBe('原创练习曲');
      expect(host.querySelector('.review-table tbody').children).toHaveLength(12);
      act(() => button('关闭导入').click());
      expect(host.querySelector('.segment-progress').textContent).toContain('1 / 7');
      expect(host.querySelector('.song-heading h2').textContent).toBe('演员');
    } finally { storage.mockRestore(); }
  });
});
