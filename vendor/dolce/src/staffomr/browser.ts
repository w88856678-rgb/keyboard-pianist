// 浏览器侧入口：PDF 字节 → MusicXML。**只有这个文件碰 pdfjs 的浏览器构建**，
// `src/staffomr/` 其余部分一律不碰 DOM（要能进 `src/cli/index.ts` 那条 Node 链）。
//
// 与简谱那条路（`src/omr/decode.ts`）的分界：那边把 PDF **光栅化**成位图再走连通域；
// 这边直接读文字层与矢量对象，不栅格化。判「该走哪条路」的是 `isStaffPdf`。
import type { OpsEnum } from "../omr/vector";
import { extractTextPage } from "../omr/vectext";
import { musicFamily } from "./symbolmap";
import { StaffGlyphLookup, type StaffGlyphDict } from "./staffglyphs";
import { TextGlyphLookup, type TextGlyphDict } from "./textglyphs";
import { recognizeStaffPage } from "./index";
import { buildScore } from "./score";
import { scoreToMusicXml } from "./toxml";
import type { StaffNote } from "./notedata";
import type { Staff } from "./model";

/**
 * 打开 PDF。
 *
 * **`disableFontFace: true` 不是可选项**：它让 worker 走 `buildFontPaths`，
 * 把字形轮廓以 commonObjs 送出来——`vectext.ts` 的紧包围盒与形状签名全靠它
 * （理由见 docs/实现/五线谱矢量识别.md）。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function openStaffPdf(bytes: Uint8Array, extra: Record<string, unknown> = {}): Promise<{ pdf: any; OPS: OpsEnum }> {
  const pdfjs = await import("pdfjs-dist");
  const { default: workerUrl } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const wasmUrl = `${import.meta.env.BASE_URL}redist/pdfjs/`;
  // getDocument 会 detach 传入的 buffer，复制一份避免污染调用方字节。
  const task = pdfjs.getDocument({ data: bytes.slice(), wasmUrl, disableFontFace: true, ...extra });
  const pdf = await task.promise;
  // PDF.js 6 exposes destroy on the loading task, not the document proxy.
  (pdf as any).destroy = () => task.destroy();
  return { pdf, OPS: pdfjs.OPS as unknown as OpsEnum };
}

/**
 * 这份 PDF 是不是「文字层完整的五线谱」——也就是该不该走 `src/staffomr/` 这条路。
 *
 * 判据：取样几页，页面上要有**音乐字体的文字**（Maestro/Opus/Anastasia 一系）。
 * 没有文字层的（500 首那种全部转曲的）与只有正文字体的（歌词页）都不算。
 * 与 `vector.ts::isVectorPdf` 互补：那条判的是「转曲矢量谱」。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function isStaffPdf(pdf: any, OPS: OpsEnum, sampleCount = 5): Promise<boolean> {
  const n = pdf.numPages as number;
  const picks: number[] = [];
  for (let k = 1; k <= sampleCount; k++) picks.push(Math.max(1, Math.min(n, Math.round((n * k) / (sampleCount + 1)))));
  let musicGlyphs = 0;
  for (const pn of picks) {
    const page = await pdf.getPage(pn);
    const runs = await extractTextPage(page, OPS, { scale: 1, withOutlines: false });
    for (const r of runs) if (musicFamily(r.font)) musicGlyphs += r.glyphs.length;
    page.cleanup?.();
    if (musicGlyphs > 50) return true;
  }
  return false;
}

export interface StaffPdfResult {
  musicxml: string;
  pages: number;
  notes: number;
  parts: number;
  /** 没有谱表的页（封面/目录/歌词页）。 */
  skipped: number;
  /** `noteIds` 时：原图对照与关联表要的东西（同位图那一路的 `RasterSongResult`，坐标是 PDF 点） */
  detail?: {
    pages: { pn: number; page: Parameters<typeof buildScore>[0][number]["page"]; notes: StaffNote[] }[];
    noteBoxes: Map<string, { page: number; box: { left: number; right: number; top: number; bottom: number }; step: string; octave: number; alter: number; rest: boolean }>;
    score: ReturnType<typeof buildScore>;
    assignment(): number[][];
    rebuild(slots: number[][]): { xml: string; score: ReturnType<typeof buildScore> };
  };
}

/**
 * PDF → MusicXML（整本或指定页范围）。
 *
 * 字形字典（`glyphmap.json` 与 `lyricglyphs.json`）由 Vite 打成单独的 chunk，
 * 只在真跑这条路时才加载。
 */
export async function recognizeStaffPdf(
  bytes: Uint8Array,
  opts: { pages?: number[]; title?: string; onProgress?: (done: number, total: number) => void; noteIds?: boolean } = {},
): Promise<StaffPdfResult> {
  const { pdf, OPS } = await openStaffPdf(bytes);
  // 字形字典**动态 import**：Vite 会单独切一个 chunk，只在真跑五线谱识别时加载，
  // 而且永远与 `src/staffomr/*.json` 同步（拷进 public/ 会走味）。
  const [glyphDict, lyricDict] = await Promise.all([
    import("./glyphmap.json").then((m) => m.default as unknown as StaffGlyphDict),
    import("./lyricglyphs.json").then((m) => m.default as unknown as TextGlyphDict),
  ]);
  const look = new StaffGlyphLookup(glyphDict);
  const textLookup = new TextGlyphLookup(lyricDict);

  const list = opts.pages ?? Array.from({ length: pdf.numPages as number }, (_, i) => i + 1);
  const entries: { page: Parameters<typeof buildScore>[0][number]["page"]; ctx: Parameters<typeof buildScore>[0][number]["ctx"] }[] = [];
  const notesByStaff = new Map<Staff, StaffNote[]>();
  let carryTime: { beats: number; beatType: number } | undefined;
  let skipped = 0;
  const detailPages: NonNullable<StaffPdfResult["detail"]>["pages"] = [];
  let done = 0;
  for (const pn of list) {
    const page = await pdf.getPage(pn);
    const r = await recognizeStaffPage(page, OPS, look, pn, { textLookup, carryTime });
    carryTime = r.carryTime;
    if (r.hasStaff) {
      entries.push({ page: r.page, ctx: r.ctx });
      detailPages.push({ pn, page: r.page, notes: r.notes });
      for (const n of r.notes) {
        const a = notesByStaff.get(n.staff) ?? [];
        a.push(n);
        notesByStaff.set(n.staff, a);
      }
    } else skipped++;
    page.cleanup?.();
    opts.onProgress?.(++done, list.length);
  }
  // 内容剖面（有没有词、音域中位数）交给 `buildScore` 做全局指派，见 `score.ts::assignSlots`
  const score = buildScore(entries, {
    profileOf: (st) => {
      const ns = notesByStaff.get(st) ?? [];
      const ps = ns
        .filter((n) => !n.rest && !n.grace && n.step)
        .map((n) => "CDEFGAB".indexOf(n.step!) + 7 * n.octave!)
        .sort((a, b) => a - b);
      return { lyric: ns.some((n) => n.lyrics?.length), pitch: ps.length ? ps[ps.length >> 1] : null };
    },
  });
  // 原图对照：逐页逐音编号写进 `<note id>`、记下源框（同 `rasteromr/song.ts`）
  const noteBoxes: NonNullable<StaffPdfResult["detail"]>["noteBoxes"] = new Map();
  if (opts.noteIds) {
    let k = 0;
    detailPages.forEach(({ notes }, pi) => {
      for (const n of notes) {
        const id = `omr${++k}`;
        n.omrId = id;
        noteBoxes.set(id, { page: pi, box: { ...n.sym.box }, step: n.step ?? "C", octave: n.octave ?? 4, alter: n.alter ?? 0, rest: !!n.rest });
      }
    });
  }
  const notesOf = (st: Staff): StaffNote[] => notesByStaff.get(st) ?? [];
  const xmlOpts = { title: opts.title, ...(opts.noteIds ? { noteId: (n: StaffNote) => n.omrId } : {}) };
  const musicxml = scoreToMusicXml(score, notesOf, xmlOpts);
  let notes = 0;
  for (const v of notesByStaff.values()) notes += v.length;
  let cur = score;
  const detail: StaffPdfResult["detail"] = opts.noteIds ? {
    pages: detailPages, noteBoxes, score,
    assignment: () => cur.systems.map((e, si) => e.sys.staves.map((st) => cur.scoreStaves.findIndex((ss) => ss.staves[si] === st))),
    rebuild: (slots) => {
      cur = buildScore(entries, { slots });
      return { xml: scoreToMusicXml(cur, notesOf, xmlOpts), score: cur };
    },
  } : undefined;
  return { musicxml, pages: list.length, notes, parts: score.parts.length, skipped, ...(detail ? { detail } : {}) };
}

/** 渲成对照底图的倍数：PDF 点 × 它 = 位图像素（约 144 dpi，五线谱的符头、临时记号看得清） */
const OVERLAY_SCALE = 2;

/**
 * 矢量五线谱 PDF 的原图对照：`noteIds` 识别出的结果 + 各页渲成的位图，拼成位图那一路同形的结果
 * （`RasterSongResult`），对照视图、并排原图、谱表 ↔ 声部关联表照用。框坐标从 PDF 点放大到位图像素；
 * 页面结构（谱线）仍是点，`scale` 告诉用的人乘多少。
 */
export async function vectorOverlayResult(bytes: Uint8Array, res: StaffPdfResult): Promise<import("../rasteromr/song").RasterSongResult> {
  const d = res.detail;
  if (!d) throw new Error("识别时没开 noteIds，没有对照数据");
  const { pdf } = await openStaffPdf(bytes);
  const pages: import("../rasteromr/song").RasterSongResult["pages"] = [];
  try {
    for (const p of d.pages) {
      const page = await pdf.getPage(p.pn);
      const vp = page.getViewport({ scale: OVERLAY_SCALE });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(vp.width);
      canvas.height = Math.ceil(vp.height);
      const g = canvas.getContext("2d", { willReadFrequently: true })!;
      g.fillStyle = "#fff";
      g.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: g, viewport: vp }).promise;
      page.cleanup?.();
      // 灰度过半就算墨：与位图那一路的二值图同一种底图（`omr/overlay.ts::baseImage` 按 0/1 画）
      const px = g.getImageData(0, 0, canvas.width, canvas.height).data;
      const data = new Uint8Array(canvas.width * canvas.height);
      // pdf.js 没画到的地方是透明（读出来 RGB 全 0），按纸算，不能当墨
      for (let i = 0; i < data.length; i++) data[i] = px[i * 4 + 3]! >= 128 && px[i * 4]! * 0.3 + px[i * 4 + 1]! * 0.59 + px[i * 4 + 2]! * 0.11 < 160 ? 1 : 0;
      pages.push({
        source: 0, pn: p.pn, scale: OVERLAY_SCALE,
        result: { raster: { bin: { w: canvas.width, h: canvas.height, data } }, page: p.page, notes: p.notes } as unknown as import("../rasteromr/recognize").RasterPageResult,
      });
    }
  } finally {
    pdf.destroy?.();
  }
  const s = OVERLAY_SCALE;
  const noteBoxes: import("../rasteromr/song").RasterSongResult["noteBoxes"] = new Map(
    [...d.noteBoxes].map(([id, b]) => [id, { ...b, box: { left: b.box.left * s, right: b.box.right * s, top: b.box.top * s, bottom: b.box.bottom * s } }]),
  );
  return {
    xml: res.musicxml,
    score: d.score as unknown as import("../rasteromr/song").RasterSongResult["score"],
    stats: { notes: res.notes, harmonies: 0, lyricLines: 0, lyricStats: { rows: 0, hit: 0, parity: 0 }, bars: 0, full: 0, unknown: 0, staves: 0, pages: res.pages, halftone: null, kind: "vector", jianpuFix: { pairs: 0, pitch: 0, duration: 0, removed: 0, inserted: 0 }, parts: res.parts },
    pages, noteBoxes,
    assignment: () => d.assignment(),
    rebuild: (slots) => {
      const r = d.rebuild(slots);
      return { xml: r.xml, score: r.score as unknown as NonNullable<import("../rasteromr/song").RasterSongResult["score"]> };
    },
  };
}
