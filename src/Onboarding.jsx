import React, { useEffect, useRef, useState } from "react";
import { CheckIcon } from "@phosphor-icons/react/dist/csr/Check";
import { MusicNotesIcon } from "@phosphor-icons/react/dist/csr/MusicNotes";
import { UploadSimpleIcon } from "@phosphor-icons/react/dist/csr/UploadSimple";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { Dialog } from "./Dialog";
import { KEY_PITCHES, pitchName } from "./music";
import * as audio from "./audio";

export const TUTORIAL_STORAGE = "keyboard-pianist-tutorial-v1";
export function needsTutorial() {
  try { return localStorage.getItem(TUTORIAL_STORAGE) !== "done"; }
  catch { return true; }
}

const PRACTICE = ["A", "S", "D"];
const EXAMPLE = [
  { lyric: "简", key: "J", note: "F#3" },
  { lyric: "单", key: "D", note: "E4" },
  { lyric: "点", key: "D", note: "D#4 → D#4" },
];

export function Onboarding({ onClose, volume }) {
  const [step, setStep] = useState(0);
  const [played, setPlayed] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(false);
  const heading = useRef();
  const session = useRef({ alive: true, version: 0, played: 0, busy: false });
  useEffect(() => {
    session.current.alive = true;
    return () => {
      session.current.alive = false;
      session.current.version++;
      audio.stopAudio();
    };
  }, []);
  useEffect(() => { heading.current?.focus(); }, [step]);

  async function play(key) {
    if (!KEY_PITCHES[key] || session.current.busy) return;
    const version = session.current.version;
    session.current.busy = true;
    try {
      if (!audio.isReady()) {
        setLoading(true);
        await audio.prepareAudio();
      }
      if (!session.current.alive || session.current.version !== version) return;
      audio.volume(volume);
      audio.playPitch(KEY_PITCHES[key]);
      const progress = session.current.played;
      if (key === PRACTICE[progress]) {
        session.current.played++;
        setPlayed(session.current.played);
        setFeedback(session.current.played === PRACTICE.length
          ? "听到了吗？你的第一段旋律，已经响起来了。"
          : `很好，接着按 ${PRACTICE[session.current.played]}。`);
      } else {
        setFeedback(progress === PRACTICE.length
          ? `刚弹 ${key} → ${pitchName(KEY_PITCHES[key])}`
          : `${key} 也能发声。接下来试试金色的 ${PRACTICE[progress]}。`);
      }
    } catch {
      if (session.current.alive && session.current.version === version)
        setFeedback("音色暂时没加载好，可以再按一次，或直接进入下一步。");
    } finally {
      session.current.busy = false;
      if (session.current.alive) setLoading(false);
    }
  }
  function go(next) {
    session.current.version++;
    audio.stopAudio();
    setStep(next);
  }
  useEffect(() => {
    if (step !== 0) return;
    function down(event) {
      if (event.repeat || event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toUpperCase();
      if (KEY_PITCHES[key]) {
        event.preventDefault();
        play(key);
      }
    }
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  });

  return (
    <Dialog label="新手教程" className="tutorial-dialog" onClose={onClose}>
      <div className="tutorial-topline">
        <span>初次见面 · 约 30 秒</span>
        <button onClick={onClose} className="tutorial-skip">跳过教程</button>
      </div>
      <div className="tutorial-progress" aria-label={`教程第 ${step + 1} 步，共 2 步`}>
        <span className="active" /><span className={step === 1 ? "active" : ""} />
        <small>0{step + 1} / 02</small>
      </div>
      <h2 ref={heading} tabIndex={-1}>{step === 0 ? "你好，键盘钢琴家。" : "跟着金色字母，把歌弹出来。"}</h2>
      <p className="tutorial-intro">{step === 0 ? "不用会看谱。先用三个键，让旋律响起来。" : "选一首歌，按提示弹奏。每次一段，慢慢来。"}</p>
      {step === 0 ? (
        <>
          <div className="tutorial-practice" role="group" aria-label="按顺序试弹 A S D">
            {PRACTICE.map((key, i) => (
              <button key={key} className={`tutorial-key ${played === i ? "current" : ""} ${played > i ? "complete" : ""}`} aria-label={`试弹 ${key}，${pitchName(KEY_PITCHES[key])}`} onClick={() => play(key)}>
                <span className="tutorial-key-state">{played > i ? <CheckIcon size={16} /> : `0${i + 1}`}</span>
                <kbd>{key}</kbd>
                <span>{pitchName(KEY_PITCHES[key])}</span>
              </button>
            ))}
          </div>
          <div className="tutorial-feedback" role="status">{loading ? "正在准备钢琴音色…" : feedback || "切到英文输入法，依次按 A、S、D。也可以点击上面的按键。"}</div>
          <p className="tutorial-note">这次练习独立进行，不会改变歌曲进度。</p>
        </>
      ) : (
        <>
          <div className="tutorial-song-example" aria-label="歌词按键示例：简单点">
            {EXAMPLE.map((item, i) => <div className={i === 0 ? "current" : ""} key={i}><span className="tutorial-lyric">{item.lyric}</span><kbd>{item.key}</kbd><small>{item.note}</small></div>)}
            <p>歌词按拼音首字母，前奏和间奏按屏幕提示。<br />弹完当前段，再进入下一段；随时可以重弹或试听。</p>
          </div>
          <div className="tutorial-options">
            <div><MusicNotesIcon size={23} weight="light" /><p><strong>想随心弹？</strong><span>顶部切到「自由弹奏」，字母都能发声。</span></p></div>
            <div><UploadSimpleIcon size={23} weight="light" /><p><strong>想弹自己的歌？</strong><span>右上角「导入乐谱」，支持 MusicXML、MIDI、图片和 PDF；试听校对后保存。</span></p></div>
          </div>
        </>
      )}
      <div className="tutorial-footer">
        {step === 0 ? <span>电脑按字母，手机点屏幕，都能开始。</span> : <button className="tutorial-back" onClick={() => go(0)}>← 返回试弹</button>}
        <button className="tutorial-primary" onClick={() => step === 0 ? go(1) : onClose()}>{step === 0 ? played === 3 ? "学会了，下一步" : "下一步" : "进入琴房"}<ArrowRightIcon size={17} /></button>
      </div>
    </Dialog>
  );
}
