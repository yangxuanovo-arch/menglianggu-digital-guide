# 任务二·场景重现（路线甲）：孟良崮战役纪念碑

成品在 `web/scene/`（纯静态，可直接部署）；本目录是源码。

- `src/content.json`：解说词、要点、史料来源、图片署名（唯一内容源）。
- `src/world.js`：程序化三维场景（three.js，无外部模型）。
- `src/main.js`：热点、语音导览、字幕、讲解卡片、来源与 AI 声明。
- `tools/generate_audio.py`：用 edge-tts 生成 `web/scene/audio/*.mp3` 与字幕时间轴 `src/cues.json`。

```bash
cd scene
npm ci            # three 0.170.0 + esbuild 0.24.0
pip install edge-tts && npm run audio   # 仅在修改解说词后需要
npm run build     # 输出 web/scene/app.js
```

## 接入主导览

主程序（GuideShell）页面中加入：

```html
<script src="scene/panorama-module.js" defer></script>
```

模块在 `guide:shell-ready` 后调用 `GuideShell.registerModule('panorama', open)`；`open()` 以全屏 iframe 打开 `scene/index.html?embed=1`，场景内“返回导览”按钮或 Esc 关闭，关闭时派发 `guide:module-closed`。也可直接链接 `scene/index.html` 独立使用。
