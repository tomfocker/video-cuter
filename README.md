# Video Cuter

一个纯前端、本地处理的视频切片工具。现在已经可以直接对接本地运行的 FunASR HTTP 服务，在网页里完成：

- 上传视频
- 浏览器端提取音频并转录
- 按识别文字生成/排除剪辑选区
- 下载 SRT / 双语 SRT
- 分段导出或合并导出视频、音频

## 当前集成状态

`cut` 已按以下方式接入本地 ASR 服务：

- 默认服务地址：`http://127.0.0.1:8000`
- 健康检查：`GET /healthz`
- 转录接口：`POST /v1/audio/transcriptions`
- 请求格式：浏览器提取 `16k / mono / wav` 音频后，通过 `FormData` 上传
- 响应格式：`verbose_json`

页面会优先使用后端返回的：

- `subtitle_segments` 作为网页端文字展示与选择依据
- `srt` 作为字幕下载内容

这样可以避免前端把字幕重新拆成一个字一个字。

## 主要能力

- 多视频导入，在同一工作区里切片和切换素材
- 基于波形图拖拽创建片段
- 语音转文字并在页面中显示自然字幕片段
- 选中文字后智能合并成连续剪辑区间
- 下载后端优化后的 SRT 字幕
- 可选接入 LLM 做智能去水词和双语字幕翻译
- 批量导出单段视频、单段音频
- 将多个片段一次性合并导出为单个 MP4
- 本地保存工作区状态，刷新后可恢复同名素材的片段信息

## 快速开始

### 1. 启动 ASR Docker 服务

在 `yunyinshibie` 项目目录中启动：

```bash
docker compose up --build
```

确认服务在线：

```bash
curl http://127.0.0.1:8000/healthz
```

期望看到类似结果：

```json
{"status":"ok","model":"fun_asr_nano","ready":true}
```

### 2. 启动 cut 静态页面

在本项目目录执行任意静态服务器，例如：

```bash
python3 -m http.server 4173
```

然后打开：

```text
http://127.0.0.1:4173
```

### 3. 在页面里配置识别服务

点击页面中的“齿轮”按钮，填写：

- 通过 bundle 或反向代理打开前端时：`/api/asr`
- 本机直接运行后端时：`http://127.0.0.1:8000`
- bundle 暴露后端端口时：`http://127.0.0.1:18000`

点击“测试连接”后，状态应显示服务已连接。

注意：

- 浏览器里不要直接填写 `asr:8000` 或 `capswriter-funasr:8000` 这类 Docker 服务名
- 这类地址只适用于容器和容器之间互相调用，不适用于宿主机浏览器

### 4. 直接运行 cut 轻量 Docker 镜像

这个仓库现在也可以单独打成一个轻量前端镜像。默认只负责：

- 托管 `cut` 静态页面
- 通过同源 `/api/asr/*` 反向代理到后端 ASR 服务
- 同时透传 `/healthz`、`/v1/audio/transcriptions`、`/api/transcriptions`
- 在启动时注入运行时 `config.js`

构建镜像：

```bash
docker build -t videocuter-web:latest .
```

如果后端服务在宿主机 `127.0.0.1:8000`，可以单独运行：

```bash
docker run --rm -p 18080:8000 \
  -e CUT_SERVER_API_URL=/api/asr \
  -e CUT_ASR_UPSTREAM=host.docker.internal:8000 \
  videocuter-web:latest
```

然后可以通过同一个前端端口完成检查和转录：

```bash
curl http://127.0.0.1:18080/healthz
curl -X POST \
  -F file=@/tmp/cut-asr-check.wav \
  -F model=fun_asr_nano \
  -F response_format=verbose_json \
  http://127.0.0.1:18080/v1/audio/transcriptions
```

更推荐的方式是直接使用同一套 compose 打包层：

```text
/Users/andy/Code/cut-funasr-bundle
```

这个目录会把 `cut` 前端镜像和 `yunyinshibie` 后端镜像一起编排起来。

## 使用说明

### 语音转录

1. 上传视频
2. 等待浏览器端 FFmpeg 内核加载完成
3. 点击“语音转文字”
4. 页面会自动提取音频并上传到 ASR 服务
5. 转录完成后，在下方看到字幕级文本片段

### 文字选择生成剪辑区间

- `保留模式`
  - 拖选一段或多段文字
  - 点击“确认添加选区”
  - 对应时间段会写入波形选区，适合摘取金句或可用内容
- `排除模式`
  - 拖选要剔除的文字
  - 点击“确认添加选区”
  - 页面会自动把剩余文字合并成可保留区间

### 字幕下载

- `下载 SRT`
  - 优先下载后端直接返回的 `srt`
  - 如果后端未返回 `srt`，前端会根据归一化后的字幕片段兜底生成
- `下载双语 SRT`
  - 需要先配置 LLM，再执行“双语翻译”

### 智能去水词 / 双语翻译

点击 `LLM 配置` 后填写：

- API 地址
- API Key
- 模型名
- 目标语言

配置完成后可以：

- `智能去水词`：标记并删除口头禅/填充词，再自动生成保留区间
- `双语翻译`：基于当前字幕生成双语 SRT

## 实机自检

### 服务健康检查

```bash
curl -sf http://127.0.0.1:8000/healthz
```

### 真实转录接口检查

如果你在 macOS 上，可以直接生成一段测试语音并上传：

```bash
say -v Ting-Ting -o /tmp/cut-asr-check.aiff "你好，世界，今天测试 cut 和 fun asr 的对接。"
afconvert /tmp/cut-asr-check.aiff /tmp/cut-asr-check.wav -d LEI16@16000 -f WAVE
curl -X POST \
  -F file=@/tmp/cut-asr-check.wav \
  -F model=fun_asr_nano \
  -F response_format=verbose_json \
  http://127.0.0.1:8000/v1/audio/transcriptions
```

返回中应包含：

- `text`
- `segments`
- `subtitle_segments`
- `srt`

## 测试

运行全部测试：

```bash
node --test tests/*.test.mjs
```

## 项目结构

- `index.html`: 主界面与布局
- `config.js`: 运行时配置入口，供 Docker 或部署层覆盖
- `js/`: 前端模块
- `tests/`: Node 原生测试
- `Dockerfile`: 轻量前端镜像
- `Caddyfile`: 静态托管与 ASR 同源代理
- `docs/superpowers/specs/`: 设计文档
- `docs/superpowers/plans/`: 实施计划

## 文档

- 设计文档：`docs/superpowers/specs/2026-04-07-cut-asr-integration-design.md`
- 实施计划：`docs/superpowers/plans/2026-04-07-cut-asr-integration.md`

## 仓库说明

- 上游仓库: [tomfocker/video-cuter](https://github.com/tomfocker/video-cuter)
- 当前仓库保留了设计与实现文档，便于后续继续迭代
