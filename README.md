# Video Cuter

一个统一维护前端源码的仓库，现在同时包含两个版本：

- `纯净版`：根目录应用，只做浏览器本地视频裁剪
- `完整版`：[`full/`](/Users/andy/Code/video-cuter/full) 目录应用，在纯前端能力基础上接入后端语音识别与字幕辅助工作流

在线演示：

```text
https://tomfocker.github.io/video-cuter/
```

当前 GitHub Pages 仍然发布根目录的纯净版。

## 项目定位

这个仓库现在负责“前端源码本身”，而不是只维护其中一个版本。

职责拆分如下：

- `video-cuter`
  维护纯净版与完整版两套前端
- `funasr-server`
  维护独立语音识别后端
- `video-cuter-suite`
  只维护 `docker compose`、gateway、整合部署说明

这样整理后，前端逻辑都回到同一个仓库里，不会再出现“完整版前端到底在哪改”的问题。

## 两个版本的区别

### 1. 纯净版

位置：

- 根目录

特点：

- 纯前端
- 纯浏览器
- 不依赖后端
- 适合 GitHub Pages 直接演示

包含能力：

- 多视频导入
- 波形选区
- 分段导出视频
- 合并导出视频
- 分段导出音频
- 合并导出音频
- 工作区本地保存

不包含：

- 语音识别
- 字幕生成
- SRT 下载
- LLM 调用
- 后端代理配置

### 2. 完整版

位置：

- [full/](/Users/andy/Code/video-cuter/full)

特点：

- 前端仍然在浏览器本地完成视频裁剪
- 通过 HTTP 调用后端语音识别服务
- 提供字幕下载、文字选区裁剪、识别服务配置等能力
- 适合与 `funasr-server` 或 `video-cuter-suite` 一起部署

额外包含：

- 语音转文字
- SRT 下载
- 双语字幕导出
- 文字选区映射到时间片段
- 识别服务地址配置
- 同源 `/api/asr` 接入能力

## 目录结构

- [index.html](/Users/andy/Code/video-cuter/index.html)
  纯净版入口
- [js/](/Users/andy/Code/video-cuter/js)
  纯净版逻辑
- [full/index.html](/Users/andy/Code/video-cuter/full/index.html)
  完整版入口
- [full/js/](/Users/andy/Code/video-cuter/full/js)
  完整版逻辑
- [tests/](/Users/andy/Code/video-cuter/tests)
  根目录纯净版测试
- [full/tests/](/Users/andy/Code/video-cuter/full/tests)
  完整版测试

## 快速开始

### 纯净版本地运行

```bash
python3 -m http.server 4173
```

打开：

```text
http://127.0.0.1:4173
```

### 完整版本地运行

```bash
cd full
python3 -m http.server 4174
```

打开：

```text
http://127.0.0.1:4174
```

如果要让完整版可用，还需要准备一个兼容的识别服务，例如：

- `http://127.0.0.1:8000`
- `http://127.0.0.1:18000`
- 或通过反向代理提供 `/api/asr`

## Docker

### 构建纯净版镜像

```bash
docker build -t videocuter-web:latest .
```

### 构建完整版镜像

```bash
docker build -t videocuter-full:latest ./full
```

### 运行完整版镜像

```bash
docker run --rm -p 18081:8000 \
  -e CUT_ASR_PROXY_UPSTREAM=host.docker.internal:18000 \
  videocuter-full:latest
```

然后访问：

```text
http://127.0.0.1:18081
```

如果你的后端和前端在同一个 Docker Compose 网络里，推荐把前端容器的代理上游直接指到服务名：

```yaml
services:
  asr:
    image: tomfocker/funasr-server:latest

  frontend:
    image: tomfocker/video-cuter-full:latest
    environment:
      CUT_ASR_PROXY_UPSTREAM: asr:8000
    ports:
      - "18081:8000"
```

这样前端默认的 `/api/asr` 就会在容器内同网转发到后端识别服务。

如果你只是本机临时跑一个静态前端而没有配置同源代理，完整版现在会在本机浏览器环境下自动回退尝试：

- `http://127.0.0.1:18000`
- `http://127.0.0.1:8000`

这样本地联调时，即使 `/api/asr` 不存在，也不需要每次手动改设置。

## 前端资源镜像

完整版前端现在支持为浏览器侧资源配置多个镜像地址，依次回退加载：

- `ffmpegPackageBaseUrls`
- `ffmpegCoreBaseUrls`
- `wavesurferBaseUrls`

默认顺序是：

- `jsDelivr`
- `unpkg`

如果你所在网络对默认 CDN 不稳定，可以在 [full/config.js](/Users/andy/Code/video-cuter/full/config.js) 或部署时注入 `window.__CUT_CONFIG__`，例如：

```js
window.__CUT_CONFIG__ = {
  ffmpegPackageBaseUrls: [
    'https://your-mirror.example/@ffmpeg/ffmpeg@0.12.15/dist/umd'
  ],
  ffmpegCoreBaseUrls: [
    'https://your-mirror.example/@ffmpeg/core@0.12.10/dist/umd'
  ],
  wavesurferBaseUrls: [
    'https://your-mirror.example/wavesurfer.js@7/dist'
  ]
};
```

## Docker Hub 自动发布

本仓库现在会自己负责前端镜像发布。

工作流见：

- [.github/workflows/dockerhub.yml](/Users/andy/Code/video-cuter/.github/workflows/dockerhub.yml)

会自动发布两个镜像：

- `tomfocker/video-cuter`
  纯净版前端
- `tomfocker/video-cuter-full`
  完整版前端

需要在 GitHub 仓库里配置：

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

如果这两个 secrets 还没填，workflow 会自动跳过，不会直接报红。

## 测试

运行根目录纯净版测试：

```bash
node --test tests/*.test.mjs
```

运行完整版测试：

```bash
cd full
node --test tests/*.test.mjs
```

这些测试会分别确保：

- 根目录仍然保持纯净前端边界
- `full/` 版本保留识别与字幕能力
- 两个版本的导出与波形逻辑没有回归

## GitHub Pages

本仓库保留 GitHub Pages 发布流程，推送到 `main` 后会自动部署根目录纯净版。

如果这是仓库第一次启用 GitHub Pages，请在仓库 `Settings > Pages` 中确认：

- Build and deployment 已启用
- Source 选择为 `GitHub Actions`

发布工作流见：

- [.github/workflows/pages.yml](/Users/andy/Code/video-cuter/.github/workflows/pages.yml)

## 维护建议

以后如果你要改：

- 纯净前端剪辑体验
  就改根目录
- 带识别能力的完整版网页
  就改 [full/](/Users/andy/Code/video-cuter/full)
- 识别后端本身
  就改 `funasr-server`
- 整合部署和 gateway
  就改 `video-cuter-suite`

## 仓库说明

- 仓库地址：[tomfocker/video-cuter](https://github.com/tomfocker/video-cuter)
- 当前仓库定位：统一维护纯净版与完整版前端源码
