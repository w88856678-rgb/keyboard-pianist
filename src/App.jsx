import React, { useEffect, useMemo, useRef, useState } from "react";
import { PlayIcon } from "@phosphor-icons/react/dist/csr/Play";
import { PauseIcon } from "@phosphor-icons/react/dist/csr/Pause";
import { UploadSimpleIcon } from "@phosphor-icons/react/dist/csr/UploadSimple";
import { MusicNotesIcon } from "@phosphor-icons/react/dist/csr/MusicNotes";
import { ListIcon } from "@phosphor-icons/react/dist/csr/List";
import { PianoKeysIcon } from "@phosphor-icons/react/dist/csr/PianoKeys";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react/dist/csr/ArrowCounterClockwise";
import { SpeakerHighIcon } from "@phosphor-icons/react/dist/csr/SpeakerHigh";
import { MetronomeIcon } from "@phosphor-icons/react/dist/csr/Metronome";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { CheckIcon } from "@phosphor-icons/react/dist/csr/Check";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { DownloadSimpleIcon } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { TrashIcon } from "@phosphor-icons/react/dist/csr/Trash";
import { InfoIcon } from "@phosphor-icons/react/dist/csr/Info";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { ArrowUpRightIcon } from "@phosphor-icons/react/dist/csr/ArrowUpRight";
import { CaretDownIcon } from "@phosphor-icons/react/dist/csr/CaretDown";
import {
  BUILT_INS,
  KEY_PITCHES,
  withAccompaniment,
  pitchName,
  pitchMidi,
  initialsFor,
  importScoreFile,
  applyLyrics,
  mergeWithPrevious,
  changeDuration,
  validSong,
  lyricTokens,
} from "./music";
import * as audio from "./audio";
import { isInstrumental, keyAction, guidedSong } from "./performance";
import { CATALOG_SOURCE, SCORE_CATALOG, searchCatalog } from "./catalog";
import { ScoreGuide } from "./ScoreGuide";
import { noteSequence, lyricsWithLines, scoreLines } from "./guidance";
import { Dialog } from "./Dialog";
import { Onboarding, needsTutorial, TUTORIAL_STORAGE } from "./Onboarding";

const STORAGE = "keyboard-pianist-songs-v1";
const DEFAULT_TEMPO = 90;
function readLibrary() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE) || "[]").filter(validSong);
  } catch {
    return [];
  }
}
const decorate = (events) =>
  events.map((e) => ({
    ...e,
    notes: e.notes.map((n) => ({ ...n })),
    noteText: e.notes.map((n) => pitchName(n.midi)).join(" "),
  }));
function CatalogDialog({ songs, onClose, onChoose, onImport }) {
  const input = useRef();
  useEffect(() => { input.current?.focus(); }, []);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("songs");
  const [limit, setLimit] = useState(12);
  const local = searchCatalog(songs, query);
  const scores = searchCatalog(SCORE_CATALOG, query);
  const results = tab === "scores" ? scores : local;
  return (
    <Dialog label="搜索歌曲与乐谱" onClose={onClose} className="catalog-dialog">
      <div className="dialog-heading">
        <div>
          <span className="eyebrow">FIND YOUR NEXT SONG</span>
          <h2>下一首，想弹什么？</h2>
        </div>
        <button className="icon-close" aria-label="关闭搜索" onClick={onClose}><XIcon size={22} /></button>
      </div>
      <label className="catalog-search">
        <MagnifyingGlassIcon size={21} />
        <input ref={input} type="search" aria-label="搜索歌名、拼音或首字母" placeholder="试试 演员、yanyuan 或 yy" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(12); }} />
      </label>
      <div className="catalog-tabs" role="group" aria-label="搜索范围">
        <button aria-pressed={tab === "scores"} onClick={() => { setTab("scores"); setLimit(12); }}>在线乐谱 <span>{scores.length}</span></button>
        <button aria-pressed={tab === "songs"} onClick={() => { setTab("songs"); setLimit(12); }}>可弹歌曲 <span>{local.length}</span></button>
      </div>
      <p className="catalog-hint">{tab === "scores" ? `已内置 ${BUILT_INS.filter(song => song.tag === "全曲简谱").length} 首旋律简谱，可直接开始弹奏；其余目录曲目可导入、试听校对。` : "选择已内置或导入的歌曲，回到琴房开始演奏。"}</p>
      <div className="catalog-results" aria-label="搜索结果">
        {results.slice(0, limit).map((item) => (
          <article className="catalog-result" key={item.id}>
            <div className="catalog-file-icon"><MusicNotesIcon size={23} /></div>
            <div className="catalog-result-copy">
              <h3>{item.title} <span>{tab === "scores" ? item.format : item.tag}</span></h3>
              <p>{tab === "scores" ? `${item.artist ? `${item.artist} · ` : ""}${item.path}` : item.artist}</p>
              {item.title === "演员" && tab === "scores" && <small>数字简谱 · 含开头器乐旋律 · 无完整钢琴伴奏</small>}
              {item.id === "actor-full" && <small>含前奏、完整歌词旋律与尾奏 · 支持分段练习</small>}
              {item.id === "chengdu-full" && <small>含前奏、间奏、完整歌词旋律与尾奏 · 支持分段练习</small>}
              {item.tag === "全曲简谱" && !["actor-full", "chengdu-full"].includes(item.id) && <small>完整谱面旋律版 · 分段按键指引 · 可查看原谱与版本说明</small>}
            </div>
            {tab === "scores" ? songs.find(s => s.sourcePath === item.path) ? <button onClick={() => onChoose(songs.find(s => s.sourcePath === item.path))}>开始弹奏 <PlayIcon size={14} weight="fill" /></button> : <a href={item.url} target="_blank" rel="noopener noreferrer" aria-label={`查看原谱：${item.path}`}>查看原谱 <ArrowUpRightIcon size={15} /></a> : <button onClick={() => onChoose(item)}>开始弹奏 <PlayIcon size={14} weight="fill" /></button>}
          </article>
        ))}
        {!results.length && <div className="catalog-empty"><MusicNotesIcon size={32} /><h3>还没找到这首歌</h3><p>试试更短的歌名或拼音，也可以导入自己的乐谱。</p><button onClick={onImport}>导入乐谱</button></div>}
      </div>
      {results.length > limit && <button className="catalog-more" onClick={() => setLimit((n) => n + 12)}>显示更多（还有 {results.length - limit} 份）</button>}
      <div className="catalog-footer">
        {tab === "scores" ? <p>目录来源 <a href={CATALOG_SOURCE.url} target="_blank" rel="noopener noreferrer">{CATALOG_SOURCE.name} <ArrowUpRightIcon size={12} /></a><br />更新于 {CATALOG_SOURCE.updatedAt} · 当前收录 {SCORE_CATALOG.length} 份文件</p> : <p>来自内置练习与我的曲库<br />导入的歌曲保存在当前浏览器。</p>}
        <button className="catalog-import" onClick={onImport}><UploadSimpleIcon size={16} /> 导入已下载的乐谱</button>
      </div>
      <p className="catalog-source-note">{tab === "scores" ? "目录中的不同版本、分页或截图可能不完整。已录入的曲目显示「开始弹奏」，其余仅显示原谱入口。" : "内置曲目随网站提供；自己导入的歌曲保存在当前浏览器，请导出重要曲谱备份。"}</p>
    </Dialog>
  );
}
export function ImportDialog({ onClose, onSave }) {
  const [score, setScore] = useState(null),
    [track, setTrack] = useState(0),
    [events, setEvents] = useState([]),
    [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notation, setNotation] = useState("auto"),
    [lyrics, setLyrics] = useState(""),
    [page, setPage] = useState(0),
    [preview, setPreview] = useState(false),
    [fileName, setFileName] = useState(""),
    [backing, setBacking] = useState(true),
    [queue, setQueue] = useState([]),
    [queueIndex, setQueueIndex] = useState(0),
    [completed, setCompleted] = useState(false);
  const batch = queue.length > 1;
  const savedCount = queue.filter((item) => item.status === "saved").length;
  const skippedCount = queue.filter((item) => item.status === "skipped").length;
  const hasNext = queueIndex + 1 < queue.length;
  const alive = useRef(true);
  const playing = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      playing.current = false;
      audio.stopAudio();
    };
  }, []);
  function queueStatus(at, status) {
    setQueue((current) => current.map((item, i) => i === at ? { ...item, status } : item));
  }
  function resetBatch() {
    stopPreview();
    setScore(null);
    setQueue([]);
    setQueueIndex(0);
    setCompleted(false);
    setError("");
    setStatus("");
  }
  function readFiles(files) {
    const selected = Array.from(files || []);
    if (!selected.length || busy) return;
    if (selected.length > 200) {
      setError("每批最多 200 个文件，请分批导入。");
      return;
    }
    if (selected.reduce((total, file) => total + file.size, 0) > 256 * 1024 * 1024) {
      setError("每批文件合计不超过 256 MB，请分批导入。");
      return;
    }
    stopPreview();
    setCompleted(false);
    setQueue(selected.map((file) => ({ file, status: "waiting" })));
    setQueueIndex(0);
    readFile(selected[0], 0);
  }
  async function readFile(file, at = queueIndex) {
    if (!file) return;
    setScore(null);
    setEvents([]);
    setLyrics("");
    setError("");
    setBusy(true);
    queueStatus(at, "reading");
    setFileName(file.name);
    setStatus("正在读取乐谱…");
    try {
      const result = await importScoreFile(
        file,
        (t) => alive.current && setStatus(t),
        notation,
      );
      if (!alive.current) return;
      setScore(result);
      setTrack(0);
      setEvents(decorate(result.tracks[0].events));
      setLyrics(lyricsWithLines(result.tracks[0].events));
      setPage(0);
      setStatus("");
      queueStatus(at, "review");
    } catch (e) {
      console.error("Score import failed:", e.stack || e);
      if (alive.current) {
        setError(`导入失败：${e.message}`);
        queueStatus(at, "failed");
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  function advance(status) {
    stopPreview();
    queueStatus(queueIndex, status);
    setError("");
    if (hasNext) {
      const next = queueIndex + 1;
      setQueueIndex(next);
      readFile(queue[next].file, next);
    } else {
      setScore(null);
      setStatus("");
      setCompleted(true);
    }
  }
  const update = (index, patch) =>
    setEvents((current) =>
      current.map((e, i) => (i === index ? { ...e, ...patch } : e)),
    );
  const cleanEvents = (includeBacking = backing) => {
    const cleaned = events
      .map((e) => {
        const names = e.noteText.trim().split(/[,，\s]+/);
        const midis = names.map(pitchMidi);
        if (midis.some((m) => m === null))
          throw new Error(
            "音符请使用 C4、F#4 这样的格式，多个音符用空格分隔。",
          );
        return {
          ...e,
          initial: e.initial.toUpperCase(),
          notes: midis.map((m, i) => ({
            ...(e.notes[i] || { duration: e.duration, offset: 0 }),
            midi: m,
          })),
        };
      })
      .map(({ noteText, ...e }) => e);
    return includeBacking && score?.tracks.length > 1
      ? withAccompaniment(
          cleaned,
          score.tracks.filter((_, i) => i !== track),
        )
      : cleaned;
  };
  function stopPreview() {
    playing.current = false;
    audio.stopAudio();
    setPreview(false);
  }
  async function previewScore() {
    if (preview) {
      stopPreview();
      return;
    }
    try {
      const cleaned = cleanEvents();
      await audio.prepareAudio();
      audio.volume(65);
      if (!alive.current) return;
      playing.current = true;
      setPreview(true);
      const start = cleaned[0].start;
      for (const e of cleaned)
        audio.later(
          () => {
            if (playing.current) audio.playEvent(e, score.bpm);
          },
          ((e.start - start) * 60000) / score.bpm,
        );
      const last = cleaned.at(-1);
      audio.later(
        () => {
          playing.current = false;
          setPreview(false);
        },
        ((last.start - start + last.duration) * 60000) / score.bpm + 500,
      );
    } catch (e) {
      setError(e.message);
    }
  }
  function save() {
    try {
      const cleaned = cleanEvents();
      const song = {
        id: crypto.randomUUID(),
        title: score.title.trim() || "未命名乐曲",
        artist: score.artist.trim() || "我的乐谱",
        bpm: Number(score.bpm),
        tag: "我的乐谱",
        source: `${score.kind} · ${fileName}`,
        events: cleaned,
      };
      if (!validSong(song))
        throw new Error(
          "请检查每一行：按键需要一个 A–Z 字母，音符与时值不能为空。",
        );
      stopPreview();
      onSave(song, { keepOpen: batch });
      if (batch) advance("saved");
    } catch (e) {
      setError(e.message);
    }
  }
  const pageEvents = events.slice(page * 12, page * 12 + 12);
  return (
    <Dialog label="导入乐谱" onClose={onClose} className="import-dialog">
      <div className="dialog-heading">
        <div>
          <span className="eyebrow">YOUR NEXT MELODY</span>
          <h2>{score ? "让乐谱，变成你的按键" : "把喜欢的歌，带进琴房"}</h2>
        </div>
        <button className="icon-close" aria-label="关闭导入" onClick={onClose}>
          <XIcon size={22} />
        </button>
      </div>
      <div className="steps">
        <span className={!score && !completed ? "current" : "complete"}>01 选择乐谱</span>
        <i />
        <span className={completed ? "complete" : score ? "current" : ""}>02 试听校对</span>
        <i />
        <span className={completed ? "current" : ""}>03 开始演奏</span>
      </div>
      {batch && <div className="batch-progress">
        <div><strong>{completed ? "本批已处理完" : `正在处理 ${queueIndex + 1} / ${queue.length}`}</strong><span>已保存 {savedCount} · 已跳过 {skippedCount}</span></div>
        {!completed && <p>{queue[queueIndex]?.file.name}</p>}
        <details><summary>查看导入列表</summary><ol>{queue.map((item, i) => <li key={i}><span>{item.file.name}</span><small>{({ waiting: "等待处理", reading: "正在识别", review: "待校对", saved: "已保存", skipped: "已跳过", failed: "导入失败" })[item.status]}</small></li>)}</ol></details>
      </div>}
      {completed ? <div className="batch-complete">
        <CheckIcon size={38} />
        <h3>{savedCount ? `${savedCount} 首歌曲已加入曲库` : "本批没有保存歌曲"}</h3>
        <p>{skippedCount ? `${skippedCount} 个文件已跳过，可修正后重新导入。` : "保存的歌曲可在曲库中搜索并演奏。"}<br />导入内容以原文件为准，不会自动补全缺失小节。</p>
        <div><button className="secondary-button" onClick={resetBatch}>继续导入一批</button><button className="gold-button" onClick={onClose}>返回琴房</button></div>
      </div> : !score ? (
        <>
          <div
            className="upload-area"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (!busy) readFiles(e.dataTransfer.files);
            }}
          >
            <UploadSimpleIcon size={38} weight="light" />
            <h3>{busy ? "正在聆听你的乐谱…" : "拖入乐谱，故事就此开始"}</h3>
            <p>或点击选择本地文件，可一次选择多首</p>
            <input
              type="file"
              multiple
              aria-label="选择乐谱文件"
              accept=".musicxml,.xml,.mxl,.mid,.midi,.png,.jpg,.jpeg,.webp,.pdf,.json"
              disabled={busy}
              onChange={(e) => { readFiles(e.target.files); e.target.value = ""; }}
            />
            <span className="file-formats">
              MusicXML · MXL · MIDI · 图片 · PDF
            </span>
          </div>
          <div className="import-options">
            <label>
              图片 / PDF 谱型
              <select
                value={notation}
                onChange={(e) => setNotation(e.target.value)}
                disabled={busy}
              >
                <option value="auto">自动判断</option>
                <option value="jianpu">简谱</option>
                <option value="staff">五线谱</option>
              </select>
            </label>
            <span>单个文件不超过 30 MB · PDF 最多 12 页</span>
          </div>
          <div className="import-note">
            <InfoIcon size={19} />
            <p>
              MusicXML 可直接读取音符与歌词。图片和 PDF
              会在本机识谱，逐首校对后保存。每个文件作为一首歌曲；同曲多页请合并成一个 PDF 或 MusicXML。没有歌词的乐谱，也可以用音符按键演奏。
            </p>
          </div>
          <a
            className="sample-link"
            href={`${import.meta.env.BASE_URL}examples/little-melody.musicxml`}
            download
          >
            <DownloadSimpleIcon size={16} /> 下载原创示例乐谱，试一次导入
          </a>
          <a
            className="sample-link"
            href={`${import.meta.env.BASE_URL}examples/instrumental-practice.musicxml`}
            download
          >
            <DownloadSimpleIcon size={16} /> 下载含前奏、间奏和伴奏的示例
          </a>
        </>
      ) : (
        <>
          <div className="score-meta">
            <label>
              曲名
              <input
                value={score.title}
                onChange={(e) => setScore({ ...score, title: e.target.value })}
              />
            </label>
            <label>
              作者
              <input
                value={score.artist}
                onChange={(e) => setScore({ ...score, artist: e.target.value })}
              />
            </label>
            <label className="bpm-input">
              速度 BPM
              <input
                type="number"
                min="30"
                max="240"
                value={score.bpm}
                onChange={(e) =>
                  setScore({
                    ...score,
                    bpm: Math.max(30, Math.min(240, Number(e.target.value))),
                  })
                }
              />
            </label>
          </div>
          <label className="track-label">
            选择旋律声部
            <select
              value={track}
              onChange={(e) => {
                stopPreview();
                const n = Number(e.target.value);
                setTrack(n);
                setEvents(decorate(score.tracks[n].events));
                setLyrics(lyricsWithLines(score.tracks[n].events));
                setPage(0);
              }}
            >
              {score.tracks.map((t, i) => (
                <option key={t.id} value={i}>
                  {t.name} · {t.events.length} 个按键
                  {t.events.some((e) => e.lyric) ? " · 含歌词" : ""}
                </option>
              ))}
            </select>
          </label>
          {score.needsReview && (
            <p className="review-warning">
              {score.kind === "识谱结果"
                ? "已生成可弹谱初稿，请对照原谱校对音高、时值、歌词和反复顺序；复杂排版可能漏识。"
                : score.reviewMessage}
            </p>
          )}
          {score.tracks.length > 1 && (
            <label className="backing-option">
              <input
                type="checkbox"
                checked={backing}
                onChange={(e) => setBacking(e.target.checked)}
              />
              保留其他声部作为钢琴伴奏
              <span>自动补入旋律开始前的前奏与器乐间奏</span>
            </label>
          )}
          <div className="lyrics-editor">
            <label htmlFor="import-lyrics">
              补充或替换歌词 <span>每个汉字对应一次敲击，换行分句</span>
            </label>
            <div>
              <textarea
                id="import-lyrics"
                placeholder="每句歌词单独一行，自动生成拼音首字母…"
                rows="2"
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
              />
              <button
                className="secondary-button"
                onClick={() => {
                  setEvents(decorate(applyLyrics(events, lyrics)));
                  setError(
                    lyricTokens(lyrics).length !==
                      events.filter((e) => e.kind !== "instrumental").length
                      ? `已填入 ${lyricTokens(lyrics).length} 个字，当前有 ${events.filter((e) => e.kind !== "instrumental").length} 个歌词按键。请在表格补齐，或把同一字的后续音符合并到上一字。`
                      : "",
                  );
                }}
              >
                生成按键
              </button>
            </div>
          </div>
          <div className="table-caption">
            <span>
              {events.length} 个按键 ·{" "}
              {events.reduce((s, e) => s + e.notes.length, 0)} 个音符
            </span>
            <span>器乐按小段手动弹奏 · 一字多音可合并</span>
          </div>
          <p className="table-scroll-hint">表格可左右滑动，逐项校对歌词、音符和拍数。</p>
          <div className="review-table" role="region" aria-label="音符校对表格" tabIndex={0}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>段落</th>
                  <th>歌词</th>
                  <th>按键</th>
                  <th>音符</th>
                  <th>拍数</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pageEvents.map((e, j) => {
                  const i = page * 12 + j;
                  return (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>
                        <select
                          aria-label={`第${i + 1}行段落`}
                          value={e.kind === "instrumental" ? e.section : "歌词"}
                          onChange={(ev) =>
                            update(
                              i,
                              ev.target.value === "歌词"
                                ? {
                                    kind: e.lyric ? "vocal" : "notes",
                                    section: "歌词",
                                    auto: false,
                                  }
                                : {
                                    kind: "instrumental",
                                    section: ev.target.value,
                                    auto: true,
                                    lyric: "",
                                  },
                            )
                          }
                        >
                          {["歌词", "前奏", "间奏", "尾奏", "器乐"].map((v) => (
                            <option key={v}>{v}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          aria-label={`第${i + 1}字歌词`}
                          value={e.lyric}
                          disabled={e.kind === "instrumental"}
                          placeholder="♪"
                          onChange={(ev) =>
                            update(i, {
                              lyric: ev.target.value,
                              initial: ev.target.value
                                ? initialsFor([ev.target.value])[0]
                                : e.initial,
                            })
                          }
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`第${i + 1}字按键`}
                          maxLength={1}
                          className="initial-field"
                          value={e.initial}
                          onChange={(ev) =>
                            update(i, {
                              initial: ev.target.value.toUpperCase(),
                            })
                          }
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`第${i + 1}字音符`}
                          value={e.noteText}
                          onChange={(ev) =>
                            update(i, { noteText: ev.target.value })
                          }
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`第${i + 1}字拍数`}
                          type="number"
                          min="0.125"
                          step="0.25"
                          value={Number(e.duration.toFixed(3))}
                          onChange={(ev) => {
                            const d = Number(ev.target.value);
                            if (d > 0)
                              setEvents((current) =>
                                changeDuration(current, i, d),
                              );
                          }}
                        />
                      </td>
                      <td>
                        <button
                          disabled={
                            i === 0 ||
                            e.kind === "instrumental" ||
                            events[i - 1]?.kind === "instrumental"
                          }
                          aria-label={`合并第${i + 1}字到上一字`}
                          onClick={() => {
                            try {
                              setEvents(
                                decorate(
                                  mergeWithPrevious(cleanEvents(false), i),
                                ),
                              );
                            } catch (error) {
                              setError(error.message);
                              return;
                            }
                            setPage((p) =>
                              Math.min(p, Math.floor((events.length - 2) / 12)),
                            );
                          }}
                        >
                          合并
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {events.length > 12 && (
            <div className="pagination">
              <button disabled={page === 0} onClick={() => setPage(page - 1)}>
                上一页
              </button>
              <span>
                {page + 1} / {Math.ceil(events.length / 12)}
              </span>
              <button
                disabled={(page + 1) * 12 >= events.length}
                onClick={() => setPage(page + 1)}
              >
                下一页
              </button>
            </div>
          )}
          <div className="review-actions">
            <button
              className="text-button"
              onClick={() => {
                resetBatch();
              }}
            >
              <ArrowLeftIcon />
              重新选择
            </button>
            <div>
              {batch && <button className="text-button" onClick={() => advance("skipped")}>跳过此首</button>}
              <button className="secondary-button" onClick={previewScore}>
                {preview ? <PauseIcon /> : <PlayIcon />}
                {preview ? "停止试听" : "试听旋律"}
              </button>
              <button className="gold-button" onClick={save}>
                <CheckIcon />
                {batch ? hasNext ? "保存并处理下一首" : "保存并完成" : "保存并演奏"}
              </button>
            </div>
          </div>
        </>
      )}
      {busy && (
        <div className="process-status" role="status">
          <span className="spinner" />
          {status}
          <span>首次识谱会加载约 26 MB 本地模型</span>
        </div>
      )}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {batch && !score && !busy && !completed && queue[queueIndex]?.status === "failed" && <div className="batch-error-actions"><button className="secondary-button" onClick={() => readFile(queue[queueIndex].file)}>重试此文件</button><button className="text-button" onClick={() => advance("skipped")}>{hasNext ? "跳过，处理下一首" : "跳过并完成"}</button></div>}
      <p className="privacy-note">
        乐谱与曲库保存在当前浏览器，本机识谱，不上传文件。
      </p>
    </Dialog>
  );
}

function Piano({ active, held = [], rangeStart = 60, onPlay, onRelease }) {
  const pointerProps = (midi) => ({
    onPointerDown: (event) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      onPlay(midi, `piano:${event.pointerId}`);
    },
    onPointerUp: (event) => onRelease(`piano:${event.pointerId}`),
    onPointerCancel: (event) => onRelease(`piano:${event.pointerId}`),
    onLostPointerCapture: (event) => onRelease(`piano:${event.pointerId}`),
    onClick: (event) => { if (event.detail === 0) onPlay(midi); },
  });
  const [compact, setCompact] = useState(
    () => window.matchMedia("(max-width:620px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(max-width:620px)");
    const change = () => setCompact(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  const range = Array.from(
    { length: compact ? 24 : 60 },
    (_, i) => (compact ? rangeStart : 36) + i,
  );
  const whites = range.filter((n) => ![1, 3, 6, 8, 10].includes(n % 12));
  const blacks = range.filter((n) => [1, 3, 6, 8, 10].includes(n % 12));
  return (
    <div className="piano" aria-label="钢琴键盘">
      <div className="piano-rail" />
      <div className="white-keys">
        {whites.map((n) => (
          <button
            key={n}
            aria-label={`弹奏 ${pitchName(n)}`}
            className={`piano-white ${active === n || held.includes(n) ? "lit" : ""}`}
            {...pointerProps(n)}
          >
            <span>{n % 12 === 0 ? pitchName(n) : ""}</span>
          </button>
        ))}
      </div>
      <div className="black-keys">
        {blacks.map((n) => {
          const left =
            (whites.filter((w) => w < n).length / whites.length) * 100;
          return (
            <button
              key={n}
              aria-label={`弹奏 ${pitchName(n)}`}
              className={`piano-black ${active === n || held.includes(n) ? "lit" : ""}`}
              style={{ left: `${left}%` }}
              {...pointerProps(n)}
            />
          );
        })}
      </div>
    </div>
  );
}
export function App() {
  const [imported, setImported] = useState(readLibrary),
    [songId, setSongId] = useState(BUILT_INS[0].id),
    [index, setIndex] = useState(0),
    [ready, setReady] = useState(false),
    [loading, setLoading] = useState(false),
    [isPreview, setIsPreview] = useState(false),
    [modal, setModal] = useState(false),
    [catalog, setCatalog] = useState(false),
    [libraryOpen, setLibraryOpen] = useState(false),
    [about, setAbout] = useState(false),
    [tutorial, setTutorial] = useState(needsTutorial),
    [stageEntered, setStageEntered] = useState(() => !needsTutorial()),
    [scoreSource, setScoreSource] = useState(false),
    [settings, setSettings] = useState(""),
    [mode, setMode] = useState("lyrics"),
    [octave, setOctave] = useState(0),
    [bpm, setBpm] = useState(DEFAULT_TEMPO),
    [vol, setVol] = useState(70),
    [sustained, setSustained] = useState(false),
    [activePitch, setActivePitch] = useState(null),
    [lastPlayed, setLastPlayed] = useState(null),
    [pressed, setPressed] = useState(""),
    [heldNotes, setHeldNotes] = useState([]),
    [notice, setNotice] = useState(""),
    [wrong, setWrong] = useState(false),
    [storageError, setStorageError] = useState("");
  const songs = [...BUILT_INS].sort((a, b) => Number(b.tag === "全曲简谱") - Number(a.tag === "全曲简谱")).concat(imported);
  const savedSong = songs.find((s) => s.id === songId) || songs[0];
  const song = useMemo(() => guidedSong(savedSong), [savedSong]);
  const lines = useMemo(() => scoreLines(song), [song]);
  const activeLine = lines.find(line => index >= line.start && index <= line.end);
  const done = index >= song.events.length;
  const expected = song.events[index];
  const engine = useRef({
    index: 0,
    preview: false,
    version: 0,
    heldKeys: new Map(),
    pressedKeys: new Set(),
  });
  const noticeTimer = useRef();
  const highlightTimer = useRef();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      audio.stopAudio();
      clearTimeout(noticeTimer.current);
      clearTimeout(highlightTimer.current);
    };
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(imported));
      setStorageError("");
    } catch {
      setStorageError("浏览器存储空间不足，请导出曲库备份。");
    }
  }, [imported]);
  useEffect(() => {
    audio.volume(vol);
  }, [vol]);
  useEffect(() => {
    if (!settings) return;
    const dismiss = (event) => {
      if (!event.target.closest?.('.popover, .round-control, .song-tag, .melody-tools')) setSettings("");
    };
    const escape = (event) => { if (event.key === 'Escape') setSettings(""); };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [settings]);
  function message(text) {
    setNotice(text);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 4200);
  }
  function illuminate(n) {
    setActivePitch(n);
    clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setActivePitch(null), 600);
  }
  function reset() {
    engine.current.version++;
    audio.stopAudio();
    engine.current.index = 0;
    engine.current.preview = false;
    engine.current.heldKeys.clear();
    engine.current.pressedKeys.clear();
    setSustained(false);
    setHeldNotes([]);
    setIndex(0);
    setIsPreview(false);
    setActivePitch(null);
    setLastPlayed(null);
    setWrong(false);
    setReady(false);
    setPressed("");
  }
  function choose(s) {
    reset();
    setSettings("");
    if (mode === "free") setMode("lyrics");
    setSongId(s.id);
    setBpm(DEFAULT_TEMPO);
  }
  function pauseAtCursor() {
    const at = engine.current.preview ? engine.current.previewReturn : engine.current.index;
    reset();
    engine.current.index = at;
    setIndex(at);
    setSettings("");
  }
  function seekSection(at) {
    reset();
    engine.current.index = at;
    setIndex(at);
    setSettings("");
  }
  function showSource() {
    pauseAtCursor();
    setScoreSource(true);
  }
  function showTutorial() {
    pauseAtCursor();
    setTutorial(true);
  }
  function closeTutorial() {
    try { localStorage.setItem(TUTORIAL_STORAGE, "done"); } catch {}
    setTutorial(false);
    setStageEntered(true);
  }
  async function ensureAudio() {
    if (audio.isReady()) {
      audio.volume(vol);
      setReady(true);
      return true;
    }
    setLoading(true);
    try {
      await audio.prepareAudio();
      audio.volume(vol);
      if (mounted.current) setReady(true);
      return true;
    } catch {
      message("钢琴音色加载失败，请刷新后重试。");
      return false;
    } finally {
      if (mounted.current) setLoading(false);
    }
  }
  function releaseHeld() {
    for (const token of engine.current.heldKeys.values())
      audio.releasePitch(token);
    engine.current.heldKeys.clear();
    engine.current.pressedKeys.clear();
    setHeldNotes([]);
  }
  function performKey(key, held) {
    const cursor = engine.current.index,
      event = song.events[cursor];
    const action = keyAction({
      key,
      mode,
      event,
      preview: engine.current.preview,
      octave,
    });
    if (!action) return;
    if (action.type === "note") {
      if (held && !engine.current.pressedKeys.has(key)) return;
      if (held && engine.current.pressedKeys.has(key)) {
        const old = engine.current.heldKeys.get(key);
        audio.releasePitch(old);
        engine.current.heldKeys.set(key, audio.attackPitch(action.midi));
        setHeldNotes(
          [...engine.current.heldKeys].flatMap(([key, token]) =>
            token ? [{ key, midi: token.midi }] : [],
          ),
        );
      } else audio.playPitch(action.midi);
      illuminate(action.midi);
      setLastPlayed({ key, notes: pitchName(action.midi), fixed: true });
      if (mode !== "free" && !engine.current.preview)
        message(
          `${pitchName(action.midi)} · 歌曲进度保留${event ? `，按 ${event.initial} 继续` : ""}`,
        );
      return;
    }
    setNotice("");
    setLastPlayed({ key, notes: noteSequence(event), lyric: event.lyric });
    audio.playEvent(event, bpm, illuminate);
    engine.current.index = cursor + 1;
    setIndex(cursor + 1);
  }
  async function hit(key, { held = false } = {}) {
    if (modal || about || catalog || libraryOpen || scoreSource || tutorial) return;
    setPressed(key);
    setTimeout(() => setPressed(""), 150);
    if (audio.isReady()) {
      setReady(true);
      performKey(key, held);
      return;
    }
    const version = engine.current.version;
    if ((await ensureAudio()) && version === engine.current.version)
      performKey(key, held);
  }
  function releaseKey(key) {
    engine.current.pressedKeys.delete(key);
    audio.releasePitch(engine.current.heldKeys.get(key));
    engine.current.heldKeys.delete(key);
    setHeldNotes((current) => current.filter((note) => note.key !== key));
    setPressed((current) => current === key ? "" : current);
  }
  function pressPointerKey(key, event) {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    engine.current.pressedKeys.add(key);
    hit(key, { held: true });
  }
  async function playPiano(n, pointerKey) {
    if (modal || about || catalog || libraryOpen || scoreSource || tutorial) return;
    const version = engine.current.version;
    if (pointerKey) engine.current.pressedKeys.add(pointerKey);
    if ((await ensureAudio()) && version === engine.current.version) {
      if (pointerKey && !engine.current.pressedKeys.has(pointerKey)) return;
      if (pointerKey && mode === "free") {
        engine.current.heldKeys.set(pointerKey, audio.attackPitch(n));
        setHeldNotes([...engine.current.heldKeys].flatMap(([key, token]) => token ? [{ key, midi: token.midi }] : []));
      } else audio.playPitch(n);
      illuminate(n);
    }
  }
  async function toggleMain() {
    if (
      isPreview ||
      (ready && !done)
    ) {
      engine.current.version++;
      audio.stopAudio();
      releaseHeld();
      if (engine.current.preview) {
        engine.current.index = engine.current.previewReturn ?? engine.current.index;
        setIndex(engine.current.index);
      }
      engine.current.preview = false;
      setSustained(false);
      setIsPreview(false);
      setReady(false);
      return;
    }
    if (done) reset();
    await ensureAudio();
  }
  function changeMode(next) {
    reset();
    setMode(next);
    setSettings("");
  }
  async function preview() {
    if (engine.current.preview) {
      engine.current.version++;
      audio.stopAudio();
      releaseHeld();
      setSustained(false);
      engine.current.preview = false;
      setIsPreview(false);
      engine.current.index = engine.current.previewReturn ?? engine.current.index;
      setIndex(engine.current.index);
      return;
    }
    const version = engine.current.version;
    if (!(await ensureAudio()) || version !== engine.current.version) return;
    audio.stopAudio();
    releaseHeld();
    setSustained(false);
    engine.current.preview = true;
    setIsPreview(true);
    const selected = activeLine || lines[0];
    const resume = engine.current.index >= song.events.length ? selected.start : engine.current.index;
    engine.current.previewReturn = resume;
    const from = selected.start;
    setIndex(from);
    engine.current.index = from;
    const start = song.events[from].start;
    for (const [offset, e] of song.events.slice(from, selected.end + 1).entries())
      audio.later(
        () => {
          if (!engine.current.preview || engine.current.version !== version) return;
          setIndex(from + offset);
          engine.current.index = from + offset;
          audio.playEvent(e, bpm, illuminate);
        },
        ((e.start - start) * 60000) / bpm,
      );
    const last = song.events[selected.end];
    audio.later(
      () => {
        if (!engine.current.preview || engine.current.version !== version) return;
        setIndex(resume);
        engine.current.index = resume;
        engine.current.preview = false;
        setIsPreview(false);
        setReady(false);
      },
      ((last.start - start + last.duration) * 60000) / bpm + 200,
    );
  }
  function setSustain(value) {
    setSustained(value);
    audio.sustain(value);
  }
  useEffect(() => {
    function down(e) {
      if (
        modal ||
        catalog ||
        libraryOpen ||
        about ||
        tutorial ||
        scoreSource ||
        e.target.closest?.('input,textarea,select,[contenteditable="true"]') ||
        e.isComposing ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        e.repeat
      )
        return;
      if (e.target.closest?.('button,a') && ['Enter', ' '].includes(e.key)) return;
      if (
        e.key === "Enter" &&
        mode !== "free" &&
        !engine.current.preview
      ) {
        e.preventDefault();
        toggleMain();
        return;
      }
      if (mode === "free" && ["ArrowUp", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
        setOctave((o) =>
          Math.max(-1, Math.min(1, o + (e.key === "ArrowUp" ? 1 : -1))),
        );
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        setSustain(true);
        return;
      }
      if (/^[a-z0-9]$/i.test(e.key)) {
        e.preventDefault();
        const key = e.key.toUpperCase();
        engine.current.pressedKeys.add(key);
        hit(key, { held: true });
      }
    }
    function up(e) {
      if (tutorial) return;
      const key = e.key.toUpperCase();
      releaseKey(key);
      if (e.code === "Space") setSustain(false);
    }
    function blur() {
      releaseHeld();
      setSustain(false);
      setPressed("");
    }
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  });
  function openImport() {
    pauseAtCursor();
    setCatalog(false);
    setLibraryOpen(false);
    setSettings("");
    setModal(true);
  }
  function saveSong(s, { keepOpen = false } = {}) {
    const next = [...imported, s];
    try {
      localStorage.setItem(STORAGE, JSON.stringify(next));
    } catch {
      throw new Error("浏览器存储空间不足，此首尚未保存。请先导出备份、清理曲库后重试。");
    }
    setImported(next);
    if (!keepOpen) setModal(false);
    choose(s);
    message("已加入我的曲库，开始你的演奏吧。");
  }
  function exportSong() {
    const blob = new Blob([JSON.stringify(savedSong, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${song.title}-键盘曲谱.json`;
    a.click();
    URL.revokeObjectURL(url);
    message("已导出曲谱备份。");
  }
  const instrumental = mode !== "free" && isInstrumental(expected);
  const vocalEvents = song.events
    .map((e, n) => ({ e, n }))
    .filter(({ e }) => !isInstrumental(e));
  const vocalTotal = vocalEvents.length;
  const vocalPlayed = song.events
    .slice(0, index)
    .filter((e) => !isInstrumental(e)).length;
  const shownPitch =
    activePitch ?? (!done && mode !== "free" ? expected?.notes[0]?.midi : null);
  const currentCue = (
    <div
            className="next-cue-wrap"
            style={{ "--cursor": 1 }}
          >
            {mode === "free" ? (
              <span className="next-cue">
                固定音高 <b>A → {pitchName(KEY_PITCHES.A + octave * 12)}</b>
              </span>
            ) : done ? (
              <span className="next-cue finished">
                <CheckIcon />
                演奏完成
              </span>
            ) : (
              <span className={`next-cue ${wrong ? "wrong" : ""}`} aria-live="polite">
                {isPreview ? "正在试听" : "现在按"} <b>{isPreview ? expected?.lyric || expected?.initial : mode === "any" ? "任意字母" : expected?.initial}</b>
                <span className="cue-notes">→ {noteSequence(expected)}</span>
              </span>
            )}
            <div className={`played-note-feedback ${lastPlayed ? "" : "is-empty"}`} aria-live="polite">
            {lastPlayed ? <>刚弹 <b>{lastPlayed.key}</b> → {lastPlayed.notes}{lastPlayed.lyric && <span> · {lastPlayed.lyric}</span>}{lastPlayed.fixed && mode !== "free" && <span> · 即兴音，歌曲进度保留</span>}</> : instrumental ? "跟着金色字母逐音弹奏，本段弹完再进入下一段。" : mode !== "free" ? "每个字下方依次是按键和音名，金色标记是当前要弹的字。" : "按键下方显示固定音名，支持多键同时弹奏。"}
          </div>
          </div>
  );
  const melodyTools = (
    <div className="melody-tools">
            {mode === "free" ? (
              <span>支持多键和弦 · ↑ ↓ 切换八度</span>
            ) : (
              <>
                <button
                  className="preview-link"
                  onClick={preview}
                  disabled={loading}
                >
                  {isPreview ? <PauseIcon size={14} /> : <PlayIcon size={14} />}{" "}
                  {isPreview ? "停止试听" : "试听本段"}
                </button>
                <span>
                  歌词 {vocalPlayed} / {vocalTotal}
                </span>
                {(
                  <button
                    className="preview-link"
                    onClick={() =>
                      setSettings(settings === "song" ? "" : "song")
                    }
                  >
                    曲谱管理
                  </button>
                )}
              </>
            )}
          </div>
  );
  return (
    <div className="piano-app">
      <div className="room-background" />
      <header className="stage-topbar">
        <a className="brand" href="#" aria-label="键盘钢琴家，回到演员" onClick={e => { e.preventDefault(); choose(BUILT_INS[0]); }}>
          <PianoKeysIcon size={23} weight="light" /><h1>键盘钢琴家</h1>
        </a>
        <div className="top-library-actions">
          <button className="topbar-button" aria-label="打开我的曲库" onClick={() => { pauseAtCursor(); setLibraryOpen(true); }}><ListIcon size={20} /><span>曲库</span></button>
          <button className="topbar-button search-entry" aria-label="搜索歌曲与乐谱" onClick={() => { pauseAtCursor(); setCatalog(true); }}><MagnifyingGlassIcon size={20} /><span>搜索</span></button>
        </div>
        <div className="topbar-actions">
          <button className="topbar-button tutorial-entry" onClick={showTutorial}><PlayIcon size={18} /><span>新手教程</span></button>
          {song.scoreImage && <button className="topbar-button source-entry" onClick={showSource}><ArrowUpRightIcon size={18} /><span>查看原谱</span></button>}
          <button className="import-button" onClick={openImport}><UploadSimpleIcon size={20} />导入乐谱</button>
          <button className="topbar-button about-entry" aria-label="关于这间琴房" title="关于这间琴房" onClick={() => { pauseAtCursor(); setAbout(true); }}><InfoIcon size={20} /><span className="sr-only">关于这间琴房</span></button>
        </div>
      </header>
      <main className={`main-stage ${stageEntered ? "stage-entered" : "stage-awaiting"} ${song.sections && mode !== "free" ? "with-sections" : ""}`}>
        <header className="stage-header">
          <div className="play-mode-switch" role="group" aria-label="演奏模式">
            <button
              className={mode !== "free" ? "active" : ""}
              aria-pressed={mode !== "free"}
              onClick={() => changeMode("lyrics")}
            >
              跟歌弹奏
            </button>
            <button
              className={mode === "free" ? "active" : ""}
              aria-pressed={mode === "free"}
              onClick={() => changeMode("free")}
            >
              自由弹奏
            </button>
          </div>
          <div className="song-heading">
            <h2>{mode === "free" ? "自由琴房" : song.title}</h2>
            {mode !== "free" && <p>{song.artist}</p>}
            <button
              className="song-tag"
              aria-label="选择演奏方式"
              aria-expanded={settings === "mode"}
              onClick={() => setSettings(settings === "mode" ? "" : "mode")}
            >
              {mode === "free"
                ? "自由弹奏"
                : mode === "any"
                  ? "任意键演奏"
                  : song.tag}
              <CaretDownIcon size={12} />
            </button>
            {settings === "mode" && (
              <div className="mode-menu popover">
                <span>演奏方式</span>
                {[
                  ["lyrics", "歌词首字母", "按提示字母，弹出对应旋律"],
                  ["any", "任意键演奏", "敲任意字母，弹出下一个旋律音"],
                  ["free", "自由弹奏", "每个键对应固定音高"],
                ].map(([v, t, d]) => (
                  <button
                    key={v}
                    className={mode === v ? "chosen" : ""}
                    onClick={() => {
                      changeMode(v);
                    }}
                  >
                    <strong>{t}</strong>
                    <small>{d}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
          {song.sections && mode !== "free" && <div className="song-sections">
            <label htmlFor="song-section">从段落开始</label>
            <select id="song-section" value={[...song.sections].reverse().find(s => s.eventIndex <= index)?.eventIndex ?? 0} onChange={e => { seekSection(Number(e.target.value)); e.currentTarget.blur(); }}>
              {song.sections.map(section => <option key={section.label} value={section.eventIndex}>{section.label}</option>)}
            </select>

          </div>}
        </header>
        <section className={`melody-stage ${mode !== "free" ? "continuous-melody" : ""}`} aria-label="歌词与按键">
          {mode === "free" ? <div className="lyric-strip">
              <div className="free-mode">
                <p>26 个字母，各有音高。按住实体键或屏幕按键，让音符持续。</p>
                <div className="octave-control">
                  <button
                    aria-label="降低八度"
                    disabled={octave === -1}
                    onClick={() => setOctave((o) => o - 1)}
                  >
                    −
                  </button>
                  <span>
                    八度 {octave > 0 ? "+" : ""}
                    {octave}
                  </span>
                  <button
                    aria-label="升高八度"
                    disabled={octave === 1}
                    onClick={() => setOctave((o) => o + 1)}
                  >
                    ＋
                  </button>
                </div>
              </div>
          </div> : <ScoreGuide song={song} lines={lines} index={index} preview={isPreview} mode={mode}
            onSeek={seekSection} onHit={hit} cue={currentCue} tools={melodyTools} />}
          {mode === "free" && currentCue}
          {mode === "free" && melodyTools}
          {settings === "song" && (
            <div className="song-menu popover">
              <p>{song.source}</p>
              {song.scoreImage && <button onClick={showSource}><MusicNotesIcon />原谱与版本说明</button>}
              <button onClick={exportSong}>
                <DownloadSimpleIcon />
                导出曲谱
              </button>
              {imported.some((s) => s.id === song.id) && (
                <button
                  onClick={() => {
                    const id = song.id;
                    choose(BUILT_INS[0]);
                    setImported((current) =>
                      current.filter((s) => s.id !== id),
                    );
                    setSettings("");
                    message("已从曲库移除，可重新导入。");
                  }}
                >
                  <TrashIcon />
                  移出曲库
                </button>
              )}
            </div>
          )}
        </section>
        <Piano
          active={shownPitch}
          held={heldNotes.map((n) => n.midi)}
          rangeStart={mode !== "free" && activeLine ? Math.max(24, Math.min(84,
            Math.floor(Math.min(...activeLine.items.flatMap(item => item.event.notes.map(note => note.midi))) / 12) * 12,
          )) : 60}
          onPlay={playPiano}
          onRelease={releaseKey}
        />
        <p className="keyboard-caption"><span className="desktop-keyboard-hint">按电脑键盘或点击字母弹奏</span><span className="touch-keyboard-hint">点按字母弹奏 · 自由模式可长按</span></p>
        <section className="computer-keyboard" aria-label="电脑键盘">
          {["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"].map((row) => (
            <div className="key-row" key={row}>
              {[...row].map((k) => {
                const action = keyAction({ key: k, mode, event: expected, preview: isPreview, octave });
                const notes = action?.type === "melody" ? noteSequence(expected) : pitchName(action?.midi ?? KEY_PITCHES[k] + octave * 12);
                return (
                <button
                  key={k}
                  className={`computer-key ${mode !== "free" && !done && !isPreview && (mode === "any" || expected?.initial === k) ? "expected" : ""} ${pressed === k || heldNotes.some((n) => n.key === k) ? "pressed" : ""}`}
                  aria-label={`按键 ${k}`}
                  title={`${k} → ${notes}`}
                  onPointerDown={(event) => pressPointerKey(k, event)}
                  onPointerUp={() => releaseKey(k)}
                  onPointerCancel={() => releaseKey(k)}
                  onLostPointerCapture={() => releaseKey(k)}
                  onClick={(event) => { if (event.detail === 0) hit(k); }}
                >
                  <span>{k}</span>
                  <small>
                    {notes}
                  </small>
                </button>
              ); })}
            </div>
          ))}
          <button
            className={`space-key ${sustained ? "pressed" : ""}`}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              setSustain(true);
            }}
            onPointerUp={() => setSustain(false)}
            onPointerCancel={() => setSustain(false)}
            onLostPointerCapture={() => setSustain(false)}
            onClick={(event) => { if (event.detail === 0) setSustain(!sustained); }}
            aria-pressed={sustained}
            aria-label="空格延音"
          >
            延音<span>SPACE</span>
          </button>
        </section>
        <footer className="performance-controls">
          <div className="controls-group">
            <button
              className="start-button"
              onClick={toggleMain}
              disabled={loading}
            >
              {loading ? (
                <span className="spinner" />
              ) : isPreview || (ready && !done) ? (
                <PauseIcon size={26} weight="fill" />
              ) : (
                <PlayIcon size={29} weight="fill" />
              )}
              <span>
                {loading
                  ? "准备音色…"
                  : isPreview
                    ? "停止试听"
                    : done
                        ? "再弹一次"
                        : ready
                          ? mode === "free"
                            ? "自由弹奏中"
                            : "演奏中"
                          : mode === "free"
                            ? "开始自由弹奏"
                            : "开始演奏"}
              </span>
            </button>
            <div className="round-control">
              <button aria-label="重新开始" onClick={reset}>
                <ArrowCounterClockwiseIcon size={29} />
              </button>
              <span>重新开始</span>
            </div>
            <div className="round-control">
              <button
                aria-label="调节音量"
                aria-expanded={settings === "volume"}
                onClick={() =>
                  setSettings(settings === "volume" ? "" : "volume")
                }
              >
                <SpeakerHighIcon size={29} />
              </button>
              <span>音量</span>
              {settings === "volume" && (
                <div className="volume-popover popover">
                  <label htmlFor="volume">
                    音量 <b>{vol}%</b>
                  </label>
                  <input
                    id="volume"
                    aria-label="音量"
                    type="range"
                    min="0"
                    max="100"
                    value={vol}
                    onChange={(e) => setVol(Number(e.target.value))}
                  />
                </div>
              )}
            </div>
            <div className="round-control tempo-control">
              <button
                aria-label="调节节奏"
                aria-expanded={settings === "tempo"}
                onClick={() => setSettings(settings === "tempo" ? "" : "tempo")}
              >
                <MetronomeIcon size={24} />
                <small>{bpm} BPM</small>
              </button>
              <span>节奏</span>
              {settings === "tempo" && (
                <div className="tempo-popover popover">
                  <label htmlFor="tempo">
                    节奏 <b>{bpm} BPM</b>
                  </label>
                  <input
                    id="tempo"
                    aria-label="节奏"
                    type="range"
                    min="30"
                    max="180"
                    value={bpm}
                    disabled={isPreview}
                    onChange={(e) => setBpm(Number(e.target.value))}
                  />
                  <button
                    className="text-button"
                    disabled={isPreview}
                    onClick={() => setBpm(DEFAULT_TEMPO)}
                  >
                    恢复默认
                  </button>
                </div>
              )}
            </div>
          </div>
        </footer>
        <div className="stage-status" role="status">{notice || storageError}</div>
      </main>
      {libraryOpen && <Dialog label="我的曲库" onClose={() => setLibraryOpen(false)} className="library-dialog">
        <div className="dialog-heading"><div><h2>我的曲库</h2></div><button className="icon-close" aria-label="关闭曲库" onClick={() => setLibraryOpen(false)}><XIcon size={22} /></button></div>
        <p className="library-summary">{BUILT_INS.filter(s => s.tag === "全曲简谱").length} 首歌曲 · 2 首练习曲{imported.length > 0 ? ` · ${imported.length} 首已导入` : ""}</p>
        <nav className="song-list" aria-label="我的曲库">
          {songs.map((s, n) => <button key={s.id} className={`song-item ${song.id === s.id ? "selected" : ""}`} aria-current={song.id === s.id ? "true" : undefined} onClick={() => { setLibraryOpen(false); choose(s); }}>
            <span className="song-number">{String(n + 1).padStart(2, "0")}</span><span><strong>{s.title}</strong><small>{s.artist}</small></span>{song.id === s.id && <MusicNotesIcon size={20} />}
          </button>)}
        </nav>
        <button className="library-about text-button" onClick={() => { setLibraryOpen(false); setAbout(true); }}>关于这间琴房 <InfoIcon size={15} /></button>
        <div className="library-footer"><button className="secondary-button" onClick={() => { setLibraryOpen(false); setCatalog(true); }}><MagnifyingGlassIcon size={18} />搜索歌曲与乐谱</button><button className="gold-button" onClick={openImport}><UploadSimpleIcon size={18} />导入乐谱</button></div>
      </Dialog>}
      {modal && (
        <ImportDialog onClose={() => setModal(false)} onSave={saveSong} />
      )}
      {tutorial && <Onboarding onClose={closeTutorial} volume={vol} />}
      {catalog && <CatalogDialog songs={songs} onClose={() => setCatalog(false)} onChoose={(item) => { setCatalog(false); choose(item); }} onImport={openImport} />}
      {scoreSource && <Dialog label={`${song.title}原谱与版本说明`} onClose={() => setScoreSource(false)} className="score-source-dialog">
        <div className="dialog-heading"><div><span className="eyebrow">THE SCORE BEHIND YOUR KEYS</span><h2>{song.title} · 原谱</h2></div><button className="icon-close" aria-label="关闭原谱" onClick={() => setScoreSource(false)}><XIcon size={22} /></button></div>
        <p>{song.edition}</p>
        <a href={song.sourceUrl} target="_blank" rel="noopener noreferrer">查看来源 <ArrowUpRightIcon size={14} /></a>
        <img src={song.scoreImage} alt={`${song.title}完整数字简谱`} />
      </Dialog>}
      {about && (
        <Dialog
          label="关于键盘钢琴家"
          onClose={() => setAbout(false)}
          className="about-dialog"
        >
          <div className="dialog-heading">
            <h2>键盘钢琴家</h2>
            <button
              className="icon-close"
              aria-label="关闭关于"
              onClick={() => setAbout(false)}
            >
              <XIcon size={22} />
            </button>
          </div>
          <p>用电脑键盘或屏幕按键，把喜欢的旋律弹出来。</p>
          <p>
            按提示字母继续歌曲，其他字母发出固定音高并保持歌曲进度。自由弹奏支持同时按多个键、按住延长音符与八度调整，空格用于延音。前奏、间奏和尾奏也会按小段提供逐音按键指引，弹完当前段再进入下一段。可以重弹、返回上一段，或只试听当前段；导入时也可以手动标注器乐段。
          </p>
          <p>
            已内置 {BUILT_INS.filter(song => song.tag === "全曲简谱").length} 首旋律简谱，按谱面版本保留器乐段与反复顺序。可从段落选择器开始练习，并对照原谱。你也可以导入自己的乐谱，导入曲库保存在当前浏览器。
          </p>
          <div className="credits">
            <p>
              玩法参考{" "}
              <a
                href="https://github.com/theajack/piano"
                target="_blank"
                rel="noreferrer"
              >
                theajack/piano
              </a>{" "}
              · MIT
            </p>
            <p>
              本地识谱{" "}
              <a
                href="https://github.com/lodebar2026/dolce"
                target="_blank"
                rel="noreferrer"
              >
                Dolce
              </a>{" "}
              · MIT · PaddleOCR 模型 Apache 2.0
            </p>
            <p>钢琴采样：Salamander Grand Piano / Alexander Holm · CC BY 3.0</p>
          </div>
        </Dialog>
      )}
    </div>
  );
}
