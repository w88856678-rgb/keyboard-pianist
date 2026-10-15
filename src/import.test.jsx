// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { ImportDialog } from "./App";

vi.mock("./audio", () => ({ stopAudio: vi.fn() }));
const xml = readFileSync("public/examples/little-melody.musicxml", "utf8");
const file = (name, text = xml) => ({ name, size: text.length, arrayBuffer: async () => new TextEncoder().encode(text).buffer });
let host, root, onSave;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  onSave = vi.fn();
  act(() => root.render(<ImportDialog onSave={onSave} onClose={() => {}} />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function upload(files) {
  const input = host.querySelector('input[type="file"]');
  Object.defineProperty(input, "files", { value: files, configurable: true });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
}
async function click(text) {
  const control = [...host.querySelectorAll("button")].find((item) => item.textContent.trim() === text);
  expect(control).toBeTruthy();
  await act(async () => control.click());
}

it("reviews each score, retains saved songs and skips a failed file without losing the queue", async () => {
  expect(host.querySelector('input[type="file"]').multiple).toBe(true);
  await upload([file("first.musicxml"), file("broken.json", "not json"), file("last.musicxml")]);
  expect(host.textContent).toContain("正在处理 1 / 3");
  expect(onSave).not.toHaveBeenCalled();
  await click("保存并处理下一首");
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(onSave.mock.calls[0][1]).toEqual({ keepOpen: true });
  expect(host.textContent).toContain("已保存 1");
  expect(host.querySelector('[role="alert"]').textContent).toContain("曲谱备份格式不完整，请重新导出 JSON 文件后再导入。");
  await click("跳过，处理下一首");
  expect(host.textContent).toContain("正在处理 3 / 3");
  await click("保存并完成");
  expect(onSave).toHaveBeenCalledTimes(2);
  expect(onSave.mock.calls.map(([song]) => song.source)).toEqual(["MusicXML · first.musicxml", "MusicXML · last.musicxml"]);
  expect(host.textContent).toContain("2 首歌曲已加入曲库");
  expect(host.textContent).toContain("1 个文件已跳过");
  await click("继续导入一批");
  expect(host.querySelector('input[type="file"]')).toBeTruthy();
});

it("does not advance or claim a saved song when persistence fails", async () => {
  onSave.mockImplementation(() => { throw new Error("浏览器存储空间不足"); });
  await upload([file("first.musicxml"), file("last.musicxml")]);
  await click("保存并处理下一首");
  expect(host.textContent).toContain("正在处理 1 / 2");
  expect(host.textContent).toContain("已保存 0");
  expect(host.querySelector('[role="alert"]').textContent).toContain("浏览器存储空间不足");
});
