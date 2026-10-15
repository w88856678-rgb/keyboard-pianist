# 本地运行与部署

如果只是想弹琴，直接打开 [在线琴房](https://keyboard-pianist.pages.dev/)，无需安装。

## 在电脑上运行

安装 Node.js 与 npm 后，在终端执行：

```sh
git clone https://github.com/w88856678-rgb/keyboard-pianist.git
cd keyboard-pianist
npm ci
npm run dev
```

打开终端显示的地址即可。发布前的本地验证使用 Node.js 26.7.0。

电脑演奏请切换英文输入法。音频需要一次点击或按键才能启动；手机可以直接点按屏幕按键。

## 生成发布文件

```sh
npm test
npm run build
npm run test:sites
```

完整静态网站位于 `dist/client`，可托管到 Cloudflare Pages 等静态托管平台。请完整上传这个目录，包括音频、字体、原谱、识谱模型、WASM 和 PDF worker，不能只上传 HTML。

当前公开体验站采用 Cloudflare Pages 直接上传。GitHub 仓库的更新不会自动替换该体验站，需重新构建并发布。

构建同时保留 `dist/server/index.js` 与 `dist/.openai/hosting.json`，供兼容的 Sites 环境使用。

## 项目入口

| 目录或文件 | 用途 |
|---|---|
| `src/App.jsx` | 琴房、曲库、导入校对与交互 |
| `src/ScoreGuide.jsx` | 歌词与器乐分段指引 |
| `src/stage.css` | 沉浸舞台界面及响应式布局 |
| `src/music.js` | MusicXML、MXL、MIDI 导入 |
| `src/audio.js` | 钢琴采样与声音播放 |
| `src/omr.js`、`vendor/dolce` | 浏览器本机识谱 |
| `scripts/scores` | 内置曲谱的转换源数据 |
| `public` | 音频、字体、曲谱、示例与识谱资源 |

测试覆盖内置歌曲逐键演奏、段落切换、自由弹奏、试听、导入和保存等流程。移动端已做响应式浏览器检查，不代表全部真实设备和浏览器都经过验证。

## 个人曲库

曲库使用当前浏览器的本地存储，不提供账号同步。`localhost`、公开站点与自行部署的站点分别保存，迁移请使用「导出曲谱 / 导入 JSON」。

请勿把个人导入文件、账号凭据或访问令牌提交到仓库。
