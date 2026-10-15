import { setOmrRuntime } from "../vendor/dolce/src/omr/runtime";
import { browserRuntime } from "../vendor/dolce/src/omr/runtime.browser";
import { installBrowserDecoder } from "../vendor/dolce/src/omr/decode.browser";
setOmrRuntime(browserRuntime);
installBrowserDecoder();

export async function recognizeScore(bytes, mime, notation, onProgress) {
  // Structured PDF symbols are read before running raster recognition.
  if (mime === "application/pdf") {
    onProgress("正在读取 PDF 乐谱符号…");
    const { openStaffPdf, isStaffPdf, recognizeStaffPdf } = await import(
      "../vendor/dolce/src/staffomr/browser"
    );
    const { pdf, OPS } = await openStaffPdf(bytes);
    let staff;
    try {
      if (pdf.numPages > 12)
        throw new Error("请把 PDF 拆分为 12 页以内再导入。");
      staff = notation === "auto" && (await isStaffPdf(pdf, OPS));
    } finally {
      await pdf.destroy();
    }
    if (staff) {
      const result = await recognizeStaffPdf(bytes, {
        onProgress: (n, total) =>
          onProgress(`正在识别五线谱 ${n} / ${total} 页…`),
      });
      if (result.notes > 0) return result.musicxml;
    }
  }
  const raster = await import("../vendor/dolce/src/rasteromr/browser");
  const pdfBytes = await raster.asRasterPdf(bytes, mime);
  const isStaff =
    notation === "staff" ||
    (notation === "auto" && (await raster.looksLikeStaffBytes(pdfBytes)));
  onProgress("正在准备本地识谱模型，首次使用稍需等待…");
  if (isStaff) {
    const result = await raster.recognizeRasterPdfs([pdfBytes], {
      onPage: (n, total) => onProgress(`正在识别五线谱 ${n} / ${total} 页…`),
    });
    return result.xml;
  }
  onProgress("正在识别简谱音符与歌词，请保持页面打开…");
  const { recognizeMusicppDetailed } = await import(
    "../vendor/dolce/src/omr/recognize"
  );
  const { recognizedToDoc } = await import("../vendor/dolce/src/omr/todoc");
  const { scoreDocToMusicXml } = await import(
    "../vendor/dolce/src/model/toxml"
  );
  const { score } = await recognizeMusicppDetailed(bytes, mime, {
    review: true,
  });
  return scoreDocToMusicXml(recognizedToDoc(score));
}
