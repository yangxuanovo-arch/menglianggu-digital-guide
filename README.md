# menglianggu-digital-guide
“红色齐鲁”数字创意挑战赛参赛作品：孟良崮战役纪念地数字导览（H5 地图 + 数字人讲解 + 研学打卡）

## AI declaration / 人工智能使用声明

“AI 数字讲述”门户采用虚构成年讲解员，非真实人物或历史人物肖像。画面与声音均为 AI 合成，不代表历史影像或真人讲述；史实与资料来源请见导览正文。地图页原有SVG小崮与音频导览保留，每个点位另有AI视频讲解入口。

- 肖像：RealVisXL V4.0 Lightning，CreativeML Open RAIL++-M 许可（含使用限制）。
- 口型动画：SadTalker，Apache-2.0 许可。
- 面部修复：GFPGAN，Apache-2.0 许可；第三方组件遵循各自许可。
- 配音：沿用应用现有 `tools/generate_audio.py` 的 `edge-tts`，微软普通话女声 `zh-CN-XiaoxiaoNeural`（语速 `-5%`）；语音服务适用其服务条款。此前本 README 未列出配音说明。

生成参数、肖像提示词及种子、依赖与模型许可详见 [数字人生成管线](tools/narrator/README.md)。播放器仅在操作后开始播放，视频失败时回退到原MP3与静态肖像。离线构建在总预缓存不超过30MiB时包含视频，否则视频在首次播放时缓存。统一声明见“关于”与说明书生成器附录。
