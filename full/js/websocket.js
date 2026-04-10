import { AppState } from './state.js';
import { renderTranscriptionText } from './transcription.js';
import { escapeHTML } from './utils.js';

function getTty() {
    return document.getElementById('tty');
}

function log(message, isSystem = false) {
    const time = new Date().toLocaleTimeString();
    let msgHTML = `[${time}] ${message}\n`;
    if (message.includes('Error') || message.includes('失败') || message.includes('异常') || message.includes('终止')) {
        msgHTML = `<span class="text-red-400 font-bold">[${time}] ${message}</span>\n`;
    } else if (isSystem) {
        msgHTML = `<span class="text-blue-300">[${time}] ${message}</span>\n`;
    }

    const tty = getTty();
    if (tty) {
        tty.innerHTML += msgHTML;
        tty.scrollTop = tty.scrollHeight;
    }
}

function normalizeBaseUrl(url) {
    const raw = String(url || '').trim();
    if (!raw) return '';

    let normalized = raw.replace(/\/+$/, '');
    normalized = normalized.replace(/\/(healthz|v1\/audio\/transcriptions|api\/transcriptions)$/i, '');
    return normalized;
}

function isLocalBrowserHost(locationLike = window.location) {
    const hostname = String(locationLike?.hostname || '').trim().toLowerCase();
    return hostname === '127.0.0.1' || hostname === 'localhost';
}

function isSameOriginBaseUrl(baseUrl, locationLike = window.location) {
    const normalized = normalizeBaseUrl(baseUrl);
    const currentOrigin = normalizeBaseUrl(locationLike?.origin || '');
    return Boolean(normalized && currentOrigin && normalized === currentOrigin);
}

function normalizeNumeric(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeTimestampChunk(chunk, index) {
    if (!chunk || !Array.isArray(chunk.timestamp) || chunk.timestamp.length < 2) {
        return null;
    }

    const start = normalizeNumeric(chunk.timestamp[0], 0);
    const end = normalizeNumeric(chunk.timestamp[1], start);
    const text = String(chunk.text || '').trim();
    if (!text) return null;

    return {
        id: chunk.id ?? index,
        start,
        end: end >= start ? end : start,
        text
    };
}

function normalizeSegment(segment, index) {
    if (!segment) return null;

    const start = normalizeNumeric(segment.start, 0);
    const end = normalizeNumeric(segment.end, start);
    const text = String(segment.text || '').trim();
    if (!text) return null;

    return {
        id: segment.id ?? index,
        start,
        end: end >= start ? end : start,
        text
    };
}

function normalizeSegmentArray(segments, fallbackToChunks = false) {
    if (!Array.isArray(segments)) return [];

    return segments
        .map((segment, index) => (
            fallbackToChunks ? normalizeTimestampChunk(segment, index) : normalizeSegment(segment, index)
        ))
        .filter(Boolean);
}

function segmentToChunk(segment) {
    return {
        id: segment.id,
        text: segment.text,
        timestamp: [segment.start, segment.end]
    };
}

export function normalizeTranscriptionResult(payload = {}) {
    const normalizedSegments = normalizeSegmentArray(payload.segments);
    const normalizedSubtitleSegments = normalizeSegmentArray(
        payload.subtitle_segments || payload.subtitleSegments
    );
    const normalizedLegacyChunks = normalizeSegmentArray(payload.chunks, true);

    const displaySegments = normalizedSubtitleSegments.length > 0
        ? normalizedSubtitleSegments
        : (normalizedSegments.length > 0 ? normalizedSegments : normalizedLegacyChunks);

    const text = String(payload.text || '')
        || displaySegments.map((segment) => segment.text).join('');

    return {
        ...payload,
        text,
        segments: normalizedSegments.length > 0 ? normalizedSegments : displaySegments,
        subtitleSegments: displaySegments,
        displayChunks: displaySegments.map(segmentToChunk),
        chunks: displaySegments.map(segmentToChunk),
        srt: typeof payload.srt === 'string' ? payload.srt : ''
    };
}

function setConnectionStatus(text, tone = 'neutral') {
    const connectionStatus = document.getElementById('connectionStatus');
    if (!connectionStatus) return;

    const toneClass = {
        neutral: 'text-xs text-center text-gray-400',
        success: 'text-xs text-center text-green-400',
        warning: 'text-xs text-center text-yellow-400',
        error: 'text-xs text-center text-red-400'
    };

    connectionStatus.textContent = text;
    connectionStatus.className = toneClass[tone] || toneClass.neutral;
    connectionStatus.classList.remove('hidden');
}

function isLikelyDockerServiceHost(baseUrl) {
    const normalized = normalizeBaseUrl(baseUrl);
    if (!normalized || normalized.startsWith('/')) return false;

    try {
        const parsed = new URL(normalized);
        const host = parsed.hostname;
        if (!host || host === 'localhost') return false;
        if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
        if (host.includes('.')) return false;
        return true;
    } catch (error) {
        return false;
    }
}

export function buildServerHelpState(baseUrl, errorMessage = '') {
    const normalized = normalizeBaseUrl(baseUrl);
    const help = {
        summary: '默认使用当前页面地址即可。',
        items: [
            '如果这里连不上，优先检查网关和识别服务容器。',
            '单独调试识别服务时，再切换到 http://127.0.0.1:18000 或 http://127.0.0.1:8000。'
        ]
    };

    if (!normalized) {
        help.summary = '请先填写语音识别服务地址，再测试连接。';
        return help;
    }

    if (normalized.startsWith('/') || isSameOriginBaseUrl(normalized)) {
        help.summary = '默认使用当前页面地址即可。';
        help.items = [
            '如果这里连不上，优先检查网关到识别服务的连通性。',
            '单独调试识别服务时，再切换到 http://127.0.0.1:18000 或 http://127.0.0.1:8000。'
        ];
    } else if (isLikelyDockerServiceHost(normalized)) {
        help.summary = '当前地址看起来像 Docker 内部服务名，浏览器通常无法直接访问。';
        help.items = [
            'Docker 服务名只适用于容器之间互调，浏览器里不要直接填写 funasr-server:8000。',
            '如果页面是在宿主机浏览器里打开，请改用当前页面地址、http://127.0.0.1:18000 或 http://127.0.0.1:8000。',
            '如果你确实在容器里访问前端，再确认该容器和 ASR 是否在同一个 Docker 网络。'
        ];
    }

    if (errorMessage) {
        const detail = String(errorMessage);
        if (/HTTP 404/i.test(detail)) {
            help.items.unshift('当前地址可访问，但不是识别服务根地址。请直接填写服务根地址。');
        } else if (/HTTP 502/i.test(detail)) {
            help.items.unshift('网关已收到请求，但后面的识别服务没有连通。请检查网关上游配置。');
        } else if (/HTTP 503/i.test(detail)) {
            help.items.unshift('后端服务已连通，但模型还没准备好。稍等片刻再试。');
        } else if (/abort|timeout/i.test(detail)) {
            help.items.unshift('请求超时。请确认后端容器仍在运行。');
        } else if (/fetch failed|failed to fetch|networkerror/i.test(detail.toLowerCase())) {
            help.items.unshift('浏览器无法连到这个地址。请检查端口、地址和反向代理。');
        }
    }

    return help;
}

export function renderServerHelp(baseUrl = AppState.serverApiUrl, errorMessage = '') {
    const summary = document.getElementById('serverHelpSummary');
    const list = document.getElementById('serverHelpList');
    if (!summary || !list) return;

    const help = buildServerHelpState(baseUrl, errorMessage);
    summary.textContent = help.summary;
    list.innerHTML = help.items
        .map((item) => `<li>${escapeHTML(item)}</li>`)
        .join('');
}

export function buildHealthcheckUrl(baseUrl) {
    return `${normalizeBaseUrl(baseUrl)}/healthz`;
}

export function getServerHealthcheckCandidates(baseUrl, locationLike = window.location) {
    const normalized = normalizeBaseUrl(baseUrl);
    if (!normalized) return [];

    const candidates = [normalized];
    const shouldUseLocalFallbacks = isLocalBrowserHost(locationLike)
        && (normalized.startsWith('/') || isSameOriginBaseUrl(normalized, locationLike));
    if (shouldUseLocalFallbacks) {
        for (const fallback of ['http://127.0.0.1:18000', 'http://127.0.0.1:8000']) {
            if (!candidates.includes(fallback)) {
                candidates.push(fallback);
            }
        }
    }

    return candidates;
}

function buildTranscriptionUrl(baseUrl) {
    return `${normalizeBaseUrl(baseUrl)}/v1/audio/transcriptions`;
}

export function updateTranscribeStatus() {
    const transcribeBtn = document.getElementById('transcribeBtn');
    const transcribeStatus = document.getElementById('transcribeStatus');
    if (!transcribeBtn) return;

    if (AppState.currentVideoIndex === -1 || !AppState.wavesurfer) {
        transcribeBtn.disabled = true;
        if (transcribeStatus) {
            transcribeStatus.textContent = '请先加载视频';
            transcribeStatus.className = 'text-[10px] text-gray-500 italic';
        }
        return;
    }

    if (AppState.serverReady) {
        transcribeBtn.disabled = false;
        if (transcribeStatus) {
            const modelLabel = AppState.serverInfo?.model ? ` · ${AppState.serverInfo.model}` : '';
            transcribeStatus.textContent = `识别服务已就绪${modelLabel}，可以直接开始转录`;
            transcribeStatus.className = 'text-[10px] text-green-400';
        }
        return;
    }

    transcribeBtn.disabled = true;
    if (transcribeStatus) {
        transcribeStatus.textContent = '未连接到语音识别服务，点右侧齿轮可查看推荐地址';
        transcribeStatus.className = 'text-[10px] text-yellow-400';
    }
}

export async function connectToServer() {
    const baseUrl = normalizeBaseUrl(AppState.serverApiUrl);
    if (!baseUrl) {
        AppState.serverReady = false;
        AppState.serverInfo = null;
        setConnectionStatus('请输入识别服务地址', 'warning');
        renderServerHelp(baseUrl);
        updateTranscribeStatus();
        return false;
    }

    AppState.serverApiUrl = baseUrl;
    setConnectionStatus('连接中...', 'neutral');
    renderServerHelp(baseUrl);

    const candidates = getServerHealthcheckCandidates(baseUrl);
    let lastError = null;

    for (const candidate of candidates) {
        try {
            const response = await fetch(buildHealthcheckUrl(candidate));
            if (!response.ok) {
                const error = new Error(`HTTP ${response.status}`);
                error.status = response.status;
                throw error;
            }

            const payload = await response.json();
            AppState.serverApiUrl = candidate;
            AppState.serverReady = Boolean(payload.ready);
            AppState.serverInfo = payload;

            if (candidate !== baseUrl && typeof localStorage !== 'undefined') {
                localStorage.setItem('serverApiUrl', candidate);
            }

            if (AppState.serverReady) {
                setConnectionStatus(`✓ 已连接 ${candidate} · ${payload.model || 'asr'}`, 'success');
                renderServerHelp(candidate);
            } else {
                setConnectionStatus('服务在线，但模型尚未就绪', 'warning');
                renderServerHelp(candidate, 'HTTP 503');
            }

            updateTranscribeStatus();
            return AppState.serverReady;
        } catch (error) {
            lastError = error;
            const shouldTryFallback = candidate !== candidates[candidates.length - 1]
                && [404, 502].includes(error.status);
            if (shouldTryFallback) {
                continue;
            }
            break;
        }
    }

    AppState.serverReady = false;
    AppState.serverInfo = null;
    setConnectionStatus(`✗ 连接失败: ${lastError?.message || '未知错误'}`, 'error');
    renderServerHelp(baseUrl, lastError?.message || '');

    updateTranscribeStatus();
    return AppState.serverReady;
}

async function extractAudioBlob(videoFile, inputDir, audioOutput) {
    try {
        await AppState.ffmpeg.createDir(inputDir);
    } catch (error) {}

    await AppState.ffmpeg.mount('WORKERFS', { files: [videoFile.file] }, inputDir);
    const inputPath = `${inputDir}/${videoFile.file.name}`;
    const audioArgs = [
        '-i', inputPath,
        '-vn',
        '-ac', '1',
        '-ar', '16000',
        '-c:a', 'pcm_s16le',
        audioOutput
    ];

    log(`[提取音频]: ffmpeg ${audioArgs.join(' ')}`, true);
    const result = await AppState.ffmpeg.exec(audioArgs);
    if (result !== 0) {
        throw new Error('音频提取失败');
    }

    const audioData = await AppState.ffmpeg.readFile(audioOutput);
    return new Blob([audioData.buffer], { type: 'audio/wav' });
}

async function requestTranscription(audioBlob) {
    const formData = new FormData();
    formData.append('file', audioBlob, 'cut-audio.wav');
    formData.append('model', 'fun_asr_nano');
    formData.append('response_format', 'verbose_json');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000);

    try {
        const response = await fetch(buildTranscriptionUrl(AppState.serverApiUrl), {
            method: 'POST',
            body: formData,
            signal: controller.signal
        });

        if (!response.ok) {
            let detail = `HTTP ${response.status}`;
            try {
                const payload = await response.json();
                detail = payload.detail || payload.error || detail;
            } catch (error) {}
            throw new Error(detail);
        }

        return normalizeTranscriptionResult(await response.json());
    } finally {
        clearTimeout(timeoutId);
    }
}

export async function transcribeVideo() {
    if (AppState.currentVideoIndex === -1) {
        log('请先选择视频');
        return;
    }
    if (!AppState.ffmpeg) {
        log('FFmpeg 尚未加载完成，请稍后再试');
        return;
    }

    const isReady = AppState.serverReady || await connectToServer();
    if (!isReady) {
        log('语音识别服务不可用，请检查设置', true);
        return;
    }

    const transcribeBtn = document.getElementById('transcribeBtn');
    const transcribeStatus = document.getElementById('transcribeStatus');
    const transcriptionPanel = document.getElementById('transcriptionPanel');
    const transcriptionLoading = document.getElementById('transcriptionLoading');
    const transcriptionContent = document.getElementById('transcriptionContent');
    const transcriptionText = document.getElementById('transcriptionText');
    const loadingText = document.getElementById('transcriptionLoadingText');
    const progressBar = document.getElementById('whisperProgress');

    if (transcriptionPanel) transcriptionPanel.classList.remove('hidden');
    if (transcriptionLoading) transcriptionLoading.classList.remove('hidden');
    if (transcriptionContent) transcriptionContent.classList.add('hidden');
    if (transcribeBtn) transcribeBtn.disabled = true;
    if (progressBar) progressBar.style.width = '0%';

    let inputDir = null;
    let audioOutput = null;

    try {
        const videoFile = AppState.videoFiles[AppState.currentVideoIndex];
        inputDir = `/transcribe_input_${AppState.currentVideoIndex}`;
        audioOutput = `audio_for_transcribe_${AppState.currentVideoIndex}.wav`;

        log('正在提取音频...', true);
        if (transcribeStatus) transcribeStatus.textContent = '提取音频中...';
        if (loadingText) loadingText.textContent = '提取音频中...';

        const audioBlob = await extractAudioBlob(videoFile, inputDir, audioOutput);
        if (progressBar) progressBar.style.width = '35%';

        log('音频提取成功，正在上传识别...', true);
        if (transcribeStatus) transcribeStatus.textContent = '上传音频中...';
        if (loadingText) loadingText.textContent = '上传音频中...';

        const result = await requestTranscription(audioBlob);
        if (progressBar) progressBar.style.width = '100%';

        AppState.transcriptionResults[AppState.currentVideoIndex] = result;
        AppState.transcriptionResult = result;
        renderTranscriptionText(result);
        log(`语音识别完成，共 ${result.displayChunks.length} 条字幕片段`, true);
    } catch (error) {
        log(`[错误] ${error.message}`, true);
        if (transcriptionText) {
            transcriptionText.innerHTML = `<span class="text-red-400">识别失败: ${escapeHTML(error.message)}</span>`;
        }
        if (transcriptionContent) transcriptionContent.classList.remove('hidden');
    } finally {
        if (transcriptionLoading) transcriptionLoading.classList.add('hidden');
        if (transcribeBtn) transcribeBtn.disabled = false;

        if (audioOutput) {
            try {
                await AppState.ffmpeg.deleteFile(audioOutput);
            } catch (error) {}
        }
        if (inputDir) {
            try {
                await AppState.ffmpeg.unmount(inputDir);
            } catch (error) {}
            try {
                await AppState.ffmpeg.deleteDir(inputDir);
            } catch (error) {}
        }

        updateTranscribeStatus();
    }
}
