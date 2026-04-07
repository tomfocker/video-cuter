# Video Cuter

一个纯前端、纯浏览器、本地处理的视频裁剪单页工具。

在线演示：

```text
https://tomfocker.github.io/video-cuter/
```

## 项目定位

这个仓库现在只负责一件事：

- 在浏览器里完成本地视频片段选择、整理和导出

它不再承担语音识别、字幕生成、SRT 下载、LLM 调用、后端代理这些职责。

这样拆分后，仓库边界会更清晰：

- `video-cuter`：纯前端视频编辑器
- `funasr-server`：纯语音识别后端
- 完整版整合仓库：用 `docker compose` 把前端和后端组合起来

## 功能特性

- 支持上传一个或多个本地视频
- 支持在同一工作区切换和管理多个素材
- 支持基于波形图拖拽创建选区
- 支持分段导出视频
- 支持合并导出视频
- 支持分段导出音频
- 支持合并导出音频
- 支持本地保存工作区状态，刷新后可继续编辑

## 当前不包含的能力

- 语音识别
- 字幕生成
- SRT 下载
- LLM 调用
- 任意后端 API 集成
- 运行时配置注入
- 同源反向代理

如果你需要“视频编辑 + 语音识别”的完整体验，请使用整合仓库，而不是在这个仓库里继续堆服务端逻辑。

## 技术栈

- 原生 HTML
- 模块化浏览器 JavaScript
- 浏览器端 FFmpeg
- WaveSurfer 波形交互
- Tailwind CDN
- Caddy 静态托管

## 快速开始

### 方式 1：本地静态服务

```bash
python3 -m http.server 4173
```

然后打开：

```text
http://127.0.0.1:4173
```

### 方式 2：Docker

构建镜像：

```bash
docker build -t videocuter-web:latest .
```

运行：

```bash
docker run --rm -p 18080:8000 videocuter-web:latest
```

访问：

```text
http://127.0.0.1:18080
```

## 使用流程

1. 打开页面并上传本地视频
2. 等待浏览器端 FFmpeg 和波形加载完成
3. 在左侧波形图中拖拽创建片段
4. 在右侧片段列表中检查顺序、来源和时长
5. 按需执行分段导出、合并导出、音频导出

## 浏览器说明

- 所有处理都在浏览器本地完成，不上传视频内容
- 第一次打开时需要加载浏览器端 FFmpeg，可能会稍慢
- 较大的视频、较长的素材会消耗更多内存
- 推荐使用较新的 Chromium 内核浏览器

## GitHub Pages

本仓库保留 GitHub Pages 发布流程，推送到 `main` 后会自动部署到演示站点。

如果这是仓库第一次启用 GitHub Pages，请在仓库 `Settings > Pages` 中确认：

- Build and deployment 已启用
- Source 选择为 `GitHub Actions`

否则官方 Pages workflow 会在 `configure-pages` 步骤失败，页面会暂时返回 `404`。

发布工作流见：

- [.github/workflows/pages.yml](/Users/andy/Code/cut/.github/workflows/pages.yml)

## 测试

运行全部测试：

```bash
node --test tests/*.test.mjs
```

这些测试会确保：

- 仓库保持纯前端边界
- 页面中不再出现 ASR / 字幕 / LLM 控件
- 导出逻辑和波形逻辑没有回归

## 项目结构

- [index.html](/Users/andy/Code/cut/index.html)：主界面
- [js/](/Users/andy/Code/cut/js)：浏览器端逻辑
- [tests/](/Users/andy/Code/cut/tests)：Node 原生测试
- [Dockerfile](/Users/andy/Code/cut/Dockerfile)：轻量静态页面镜像
- [Caddyfile](/Users/andy/Code/cut/Caddyfile)：静态文件服务配置
- [docs/superpowers/plans/2026-04-07-video-cuter-pure-frontend-split.md](/Users/andy/Code/cut/docs/superpowers/plans/2026-04-07-video-cuter-pure-frontend-split.md)：本轮仓库拆分计划

## 仓库说明

- 仓库地址：[tomfocker/video-cuter](https://github.com/tomfocker/video-cuter)
- 当前仓库定位：纯净的前端单页编辑器
