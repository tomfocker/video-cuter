import { AppState } from './state.js';
import { initDB } from './database.js';
import { setSwitchToVideoCallback, resetZoom } from './waveform.js';
import { switchToVideo, renderVideoList, handleFileSelect, clearAllSegments, resetWorkspace } from './video.js';
import { processAudioExport, processMergeAudioExport, executeSmartVideoExport } from './export.js';

setSwitchToVideoCallback(switchToVideo);

function saveCurrentWorkspace() {
    if (AppState.currentVideoIndex === -1 || AppState.videoFiles.length === 0) return;
    const currentVideo = AppState.videoFiles[AppState.currentVideoIndex];
    if (!currentVideo) return;
    
    const workspaceData = {
        videoFiles: AppState.videoFiles.map(v => ({
            name: v.name,
            segments: v.segments || []
        })),
        currentVideoIndex: AppState.currentVideoIndex,
        savedAt: Date.now()
    };
    
    localStorage.setItem('videoCutterWorkspace', JSON.stringify(workspaceData));
    AppState.savedWorkspaceData = workspaceData;
}

function restoreWorkspace() {
    const saved = localStorage.getItem('videoCutterWorkspace');
    if (!saved) return null;
    
    try {
        return JSON.parse(saved);
    } catch (e) {
        return null;
    }
}

window.saveCurrentWorkspace = saveCurrentWorkspace;

async function initApp() {
    console.log('Starting initApp...');
    await initDB();
    
    const savedWorkspace = restoreWorkspace();
    if (savedWorkspace && savedWorkspace.videoFiles && savedWorkspace.videoFiles.length > 0) {
        AppState.savedWorkspaceData = savedWorkspace;
    }
    
    // 获取 DOM 元素
    const fileInput = document.getElementById('fileInput');
    const uploadSection = document.getElementById('uploadSection');
    const addVideoInput = document.getElementById('addVideoInput');
    const addVideoBtn = document.getElementById('addVideoBtn');
    const resetWorkspaceBtn = document.getElementById('resetWorkspaceBtn');
    const resetZoomBtn = document.getElementById('resetZoomBtn');
    const smartBatchVideoBtn = document.getElementById('smartBatchVideoBtn');
    const smartMergeVideoBtn = document.getElementById('smartMergeVideoBtn');
    const batchAudioBtn = document.getElementById('batchAudioBtn');
    const mergeAudioBtn = document.getElementById('mergeAudioBtn');
    const clearAllSegmentsBtn = document.getElementById('clearAllSegmentsBtn');
    
    // 初始化 Lucide 图标
    if (window.lucide) window.lucide.createIcons();

    // 绑定上传逻辑
    if (uploadSection) {
        uploadSection.onclick = () => fileInput.click();
        uploadSection.addEventListener('dragover', (e) => { e.preventDefault(); uploadSection.classList.add('dragover'); });
        uploadSection.addEventListener('dragleave', () => uploadSection.classList.remove('dragover'));
        uploadSection.addEventListener('drop', (e) => { e.preventDefault(); uploadSection.classList.remove('dragover'); handleFileSelect(e.dataTransfer.files); });
    }
    
    if (fileInput) {
        fileInput.onchange = (e) => {
            if (e.target.files.length > 0) handleFileSelect(e.target.files);
        };
    }
    
    if (addVideoBtn) addVideoBtn.onclick = () => addVideoInput.click();
    if (addVideoInput) {
        addVideoInput.onchange = (e) => {
            if (e.target.files.length > 0) handleFileSelect(e.target.files);
        };
    }
    
    if (resetWorkspaceBtn) resetWorkspaceBtn.addEventListener('click', resetWorkspace);
    if (resetZoomBtn) resetZoomBtn.addEventListener('click', resetZoom);
    
    if (smartBatchVideoBtn) {
        smartBatchVideoBtn.onclick = async () => {
            const segmentsWithFiles = AppState.allSegments.map(s => ({ ...s, videoFile: AppState.videoFiles[s.videoIndex].file }));
            await executeSmartVideoExport(segmentsWithFiles, AppState.allSegments.map((_, i) => i + 1), false);
        };
    }

    if (smartMergeVideoBtn) {
        smartMergeVideoBtn.onclick = async () => {
            const segmentsWithFiles = AppState.allSegments.map(s => ({ ...s, videoFile: AppState.videoFiles[s.videoIndex].file }));
            await executeSmartVideoExport(segmentsWithFiles, [], true);
        };
    }

    if (batchAudioBtn) {
        batchAudioBtn.onclick = async () => {
            for (const seg of AppState.allSegments) {
                await processAudioExport(AppState.videoFiles[seg.videoIndex].file, [seg], [AppState.allSegments.indexOf(seg) + 1]);
            }
        };
    }

    if (mergeAudioBtn) mergeAudioBtn.onclick = async () => { await processMergeAudioExport(AppState.allSegments); };
    if (clearAllSegmentsBtn) clearAllSegmentsBtn.addEventListener('click', clearAllSegments);

    // FFmpeg 引擎加载
    const tty = document.getElementById('tty');
    const ffmpegProgressBar = document.getElementById('ffmpegProgressBar');
    
    function log(message, isSystem = false) {
        const time = new Date().toLocaleTimeString();
        let msgHTML = `[${time}] ${message}\n`;
        if (message.includes('Error') || message.includes('失败')) {
            msgHTML = `<span class="text-red-400 font-bold">[${time}] ${message}</span>\n`;
        } else if (isSystem) {
            msgHTML = `<span class="text-blue-300">[${time}] ${message}</span>\n`;
        }
        if (tty) { tty.innerHTML += msgHTML; tty.scrollTop = tty.scrollHeight; }
    }
    
    const baseURLFFMPEG = `https://unpkg.com/@ffmpeg/ffmpeg@0.12.15/dist/umd`;
    const baseURLCore = `https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd`;
    
    const toBlobURLPatched = async (url, mimeType, patcher) => {
        const resp = await fetch(url);
        let body = await resp.text();
        if (patcher) body = patcher(body);
        return URL.createObjectURL(new Blob([body], { type: mimeType }));
    };
    
    const toBlobURL = async (url, mimeType) => {
        const resp = await fetch(url);
        const blob = await resp.blob();
        return URL.createObjectURL(blob);
    };
    
    const loadFFmpeg = async () => {
        log('开始加载 FFmpeg 内核...', true);
        const ffmpegBlobURL = await toBlobURLPatched(`${baseURLFFMPEG}/ffmpeg.js`, 'text/javascript', (js) => js.replace('new URL(e.p+e.u(814),e.b)', 'r.workerLoadURL'));
        await import(ffmpegBlobURL);
        
        const FFmpegWASM = window.FFmpegWASM;
        if (!FFmpegWASM) throw new Error('FFmpeg WASM 模块未找到');
        
        AppState.ffmpeg = new FFmpegWASM.FFmpeg();
        AppState.ffmpeg.on('log', ({ message }) => console.log('[FFmpeg]', message));
        AppState.ffmpeg.on('progress', (p) => {
            if (ffmpegProgressBar) ffmpegProgressBar.style.width = `${Math.round(p.progress * 100)}%`;
        });
        
        await AppState.ffmpeg.load({
            workerLoadURL: await toBlobURL(`${baseURLFFMPEG}/814.ffmpeg.js`, 'text/javascript'),
            coreURL: await toBlobURL(`${baseURLCore}/ffmpeg-core.js`, 'text/javascript'),
            wasmURL: await toBlobURL(`${baseURLCore}/ffmpeg-core.wasm`, 'application/wasm'),
        });
        
        log('FFmpeg 内核加载成功！', true);
        if (ffmpegProgressBar) ffmpegProgressBar.style.width = '0%';
    };
    
    loadFFmpeg().catch(err => log(`[错误] FFmpeg 加载失败: ${err.message}`));
    if (window.lucide) window.lucide.createIcons();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
