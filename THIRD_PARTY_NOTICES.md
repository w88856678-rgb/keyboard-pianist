# Third-party notices

## Dolce — local score recognition

Source: https://github.com/lodebar2026/dolce
License: MIT. The upstream LICENSE is retained at `vendor/dolce/LICENSE`.

The browser OMR, score model, MusicXML exporter, PDF symbol reader and raster recognizer are vendored under `vendor/dolce/src`. Keyboard Pianist adapts the browser entry and disables native Tauri window-title calls in `src/i18n/index.ts`. It also adapts PDF.js 6 loading-task cleanup in `staffomr/browser.ts` and `omr/decode.browser.ts`. The app does not include the Dolce editor UI at runtime.

OCR models `ch_PP-OCRv4_det_infer.onnx`, `ch_PP-OCRv6_small_rec_infer.onnx` and `ppocrv6_dict.txt` are redistributed from Dolce's `public/redist/ocr`, based on PaddleOCR (Apache-2.0): https://github.com/PaddlePaddle/PaddleOCR. License retained in `licenses/PaddleOCR-Apache-2.0.txt`.

## Salamander Grand Piano

Samples by **Alexander Holm**, Yamaha C5, CC BY 3.0.
Source: https://github.com/Tonejs/audio/tree/master/salamander
License: https://creativecommons.org/licenses/by/3.0/
Original README retained at `public/audio/README-Salamander.txt`. Thirteen sampled pitches are included; intermediate notes are pitch shifted by Tone.js Sampler.

## Tone.js

https://github.com/Tonejs/Tone.js — MIT. Provides sample playback and Web Audio scheduling.

## Noto Serif SC

Copyright Google and the Noto Project Authors. SIL Open Font License 1.1.
https://github.com/google/fonts/tree/main/ofl/notoserifsc
UI subsets are self-hosted in `public/fonts`; license in `licenses/Noto-Serif-SC-OFL.txt`.

## Phosphor Icons

https://github.com/phosphor-icons/react — MIT.

## Other dependencies

React (MIT), Vite (MIT), pinyin-pro (MIT), fflate (MIT), midi-file (MIT), ONNX Runtime (MIT), PDF.js (Apache-2.0), opencc-js (MIT), opentype.js (MIT). Their licenses are included with the installed packages.

## Inspiration and generated assets

Gameplay concept references https://github.com/theajack/piano (MIT). This React implementation is newly written and does not copy its Vue components.
The piano room background and the selected design reference were generated for this project using OpenAI image generation. The app contains original practice melodies.


## 内置歌曲与原谱

内置《演员》《成都》《告白气球》《小幸运》《后来》《十年》《好久不见》《往后余生》《追光者》《岁月神偷》（不才版）《纸短情长》《暖暖》按项目持有者已取得的曲目授权收录，保留原谱、来源和版本说明。

原谱来源：[Flame-shi/musical-notation](https://github.com/Flame-shi/musical-notation)，固定版本 `d270cf5f912225d8e9ac016e8a7a2a0299204f56`。《成都》原谱制谱者为孟航。

歌曲、歌词与曲谱编排的权利仍归各自权利人。本次收录不代表这些音乐内容具有开源许可，也不向第三方授予自由再分发或商用许可。未转换的在线目录条目仅提供名称与来源元数据。

曲目版本与导入边界见 [曲库与导入说明](docs/music-library.md)。项目整体尚未声明统一开源许可；第三方组件继续遵循各自许可。
