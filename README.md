# Video Cuter

一个纯前端、纯浏览器、本地处理的视频裁剪单页工具。

在线演示：

```text
https://tomfocker.github.io/video-cuter/
```

## 这个仓库现在包含什么

- 上传一个或多个本地视频
- 基于波形图拖拽创建片段
- 在同一工作区管理多个素材
- 分段导出视频
- 合并导出视频
- 分段导出音频
- 合并导出音频
- 本地保存工作区状态

## 这个仓库刻意不包含什么

- 语音识别
- 字幕生成
- SRT 下载
- LLM 调用
- 任何后端服务耦合

这些能力将分别进入两个独立仓库：

- `funasr-server`：纯语音识别后端
- 完整版整合仓库：前端编辑器 + 语音识别服务编排

## 快速开始

### 本地静态启动

```bash
python3 -m http.server 4173
```

然后打开：

```text
http://127.0.0.1:4173
```

### Docker 启动

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

## GitHub Pages

本仓库保留 GitHub Pages 发布流程，主分支更新后会自动部署到演示站点。

如果这是仓库第一次启用 GitHub Pages，请在仓库 `Settings > Pages` 中确认：

- Build and deployment 已启用
- Source 选择为 `GitHub Actions`

否则官方 Pages workflow 会在 `configure-pages` 步骤失败，页面会暂时返回 `404`。

## 测试

```bash
node --test tests/*.test.mjs
```

## 项目结构

- `index.html`：主界面
- `js/`：浏览器端逻辑
- `tests/`：Node 原生测试
- `Dockerfile`：静态页面镜像
- `Caddyfile`：静态文件服务配置
- `docs/superpowers/plans/`：本轮拆分计划
- `.github/workflows/pages.yml`：GitHub Pages 发布流程

## 仓库说明

- 上游仓库: [tomfocker/video-cuter](https://github.com/tomfocker/video-cuter)
- 当前仓库定位为纯净的前端单页编辑器
