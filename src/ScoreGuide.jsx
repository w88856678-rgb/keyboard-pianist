import React from "react";

export function ScoreGuide({ song, lines, index, preview, mode, onSeek, onHit, cue, tools }) {
  const selected = lines.findIndex(line => index >= line.start && index <= line.end);
  const lineIndex = selected < 0 ? lines.length - 1 : selected;
  const line = lines[lineIndex];
  const nextLine = lines[lineIndex + 1];
  const played = Math.min(line.items.length, Math.max(0, index - line.start));
  const done = index >= song.events.length;
  const label = line.instrumental ? `${line.section} · 第 ${line.part} / ${line.parts} 段` : `${line.section || song.title} · 第 ${line.number} 句`;
  function seek(at, event) {
    onSeek(at);
    event.currentTarget.blur();
  }
  return <div className={`score-guide segmented-guide ${mode === "any" ? "any-key-guide" : ""}`}>
    <div className="score-scroll" role="region" aria-label="当前段落与音符">
      <div className={`score-line ${done ? "played-line" : "current-line"}`} data-active={!done} role="group"
        aria-label={line.instrumental ? label : `第 ${line.number} 句：${line.text}`}>
        <div className="score-line-heading">
          <strong>{label}</strong>
          <span className="segment-progress">本段 {played} / {line.items.length}</span>
        </div>
        <p className="segment-instruction">{line.instrumental ? "没有歌词，也能按提示弹。每次按一个字母，奏出对应的音。" : "按完整一句跟着弹，金色是当前字；字母下方是对应音名。"}</p>
        <div className={`sentence-notes ${line.instrumental ? "instrumental-notes" : ""}`} aria-label={line.instrumental ? `${line.section}本段按键` : line.text}>
          {line.items.map(({ event, index: at, steps, notes }, stepIndex) => {
            const current = index === at;
            const initial = mode === "any" ? "任意键" : event.initial;
            return <div key={at} className={`score-syllable ${current ? "current-syllable" : ""} ${at < index ? "played-syllable" : ""}`}
              aria-current={current ? "step" : undefined} title={`${event.lyric || `第 ${stepIndex + 1} 音`} · ${event.initial} → ${notes}`}>
              <span className={`score-character ${line.instrumental ? "instrumental-character" : ""}`}>{event.lyric || String(stepIndex + 1).padStart(2, "0")}</span>
              {current && !preview ? <button className="score-letter"
                aria-label={`弹奏 ${event.lyric || `第 ${stepIndex + 1} 音`}，${initial}，${notes}`} onClick={() => onHit(event.initial)}>{initial}</button>
                : <span className="score-letter">{initial}</span>}
              <span className="score-notes" aria-label={`音符 ${notes}`}>{steps.map((step, i) => <span className="note-step" key={i}>{step.text}</span>)}</span>
              {line.instrumental && <small className="note-duration">{Math.round(Math.max(...event.notes.map(note => note.duration)) * 100) / 100} 拍</small>}
            </div>;
          })}
        </div>
        {cue}
        <div className="segment-navigation">
          <button className="preview-link" disabled={lineIndex === 0 || preview}
            onClick={event => seek(lines[lineIndex - 1].start, event)}>← 上一段</button>
          <button className="preview-link" disabled={preview} onClick={event => seek(line.start, event)}>重弹这段</button>
          {nextLine && <button className="preview-link" disabled={preview} onClick={event => seek(nextLine.start, event)}>跳过这段 →</button>}
        </div>
      </div>
    </div>
    <div className="guide-secondary">
    <p className="next-segment">{nextLine ? <>下一段：<span>{nextLine.instrumental ? `${nextLine.section} · 第 ${nextLine.part} / ${nextLine.parts} 段` : nextLine.text}</span></> : done ? "整首已弹完，可以重弹本段或重新开始。" : "这是最后一段，弹完即完成整首。"}</p>
    <details className="score-legend"><summary>音名说明</summary><p>→ 一个键依次弹出 · + 同时发声 · # 升半音，数字表示八度</p></details>
    {tools}
    </div>
  </div>;
}
