import { AppState, MIN_ZOOM, MAX_ZOOM } from './state.js';
import { escapeHTML, formatTime } from './utils.js';

export function resetZoom() {
    if (!AppState.wavesurfer) return;
    AppState.currentZoom = MIN_ZOOM;
    AppState.wavesurfer.zoom(AppState.currentZoom);
}

let switchToVideoCallback = null;
export function setSwitchToVideoCallback(cb) { switchToVideoCallback = cb; }

export function mergeOverlappingSegments(segments) {
    if (segments.length <= 1) return segments;
    const result = [];
    let current = segments[0];
    for (let i = 1; i < segments.length; i++) {
        const next = segments[i];
        const sameVideo = (current.videoIndex === undefined) || (next.videoIndex === current.videoIndex);
        if (sameVideo && next.start <= current.end) {
            current.end = Math.max(current.end, next.end);
        } else {
            result.push(current);
            current = next;
        }
    }
    result.push(current);
    return result;
}

export function checkRegionOverlap(tempRegion) {
    if (!AppState.wsRegions) return false;
    const regions = AppState.wsRegions.getRegions();
    for (const r of regions) {
        if (r.id === tempRegion.id) continue;
        if (tempRegion.start < r.end && tempRegion.end > r.start) return true;
    }
    return false;
}

export function saveCurrentSegments() {
    if (AppState.currentVideoIndex === -1 || !AppState.wsRegions) return;
    const regions = AppState.wsRegions.getRegions();
    let segments = regions.map(r => ({
        id: r.id,
        start: r.start,
        end: r.end,
        color: r.options?.color || 'rgba(99, 102, 241, 0.4)'
    }));
    segments.sort((a, b) => a.start - b.start);
    segments = mergeOverlappingSegments(segments.map(s => ({ ...s, videoIndex: AppState.currentVideoIndex })));
    AppState.videoFiles[AppState.currentVideoIndex].segments = segments;
}

let renderAllSegmentsCallback = null;
let updateTranscriptionHighlightCallback = null;

export function setWaveformCallbacks(callbacks) {
    if (callbacks.renderAllSegments) renderAllSegmentsCallback = callbacks.renderAllSegments;
    if (callbacks.updateTranscriptionHighlight) updateTranscriptionHighlightCallback = callbacks.updateTranscriptionHighlight;
}

export function renderAllSegments() {
    saveCurrentSegments();
    AppState.allSegments = [];
    AppState.videoFiles.forEach((v, vIdx) => {
        let videoSegments = [...v.segments].sort((a, b) => a.start - b.start);
        videoSegments = mergeOverlappingSegments(videoSegments.map(seg => ({
            ...seg, videoIndex: vIdx, videoName: v.name, videoFile: v.file, videoObjectURL: v.objectURL
        })));
        AppState.allSegments = AppState.allSegments.concat(videoSegments);
    });
    AppState.allSegments.sort((a, b) => a.videoIndex !== b.videoIndex ? a.videoIndex - b.videoIndex : a.start - b.start);
    
    const segmentsList = document.getElementById('segmentsListContainer');
    const totalDurationDisplay = document.getElementById('totalDurationDisplay');
    const totalDurationValue = document.getElementById('totalDurationValue');
    const smartMergeVideoBtn = document.getElementById('smartMergeVideoBtn');
    const batchAudioBtn = document.getElementById('batchAudioBtn');
    const mergeAudioBtn = document.getElementById('mergeAudioBtn');
    const smartBatchVideoBtn = document.getElementById('smartBatchVideoBtn');
    
    const hasRegions = AppState.allSegments.length > 0;
    const hasMultiple = AppState.allSegments.length > 1;
    
    if (batchAudioBtn) batchAudioBtn.disabled = !hasRegions;
    if (smartBatchVideoBtn) smartBatchVideoBtn.disabled = !hasRegions;
    if (mergeAudioBtn) mergeAudioBtn.disabled = !hasMultiple;
    if (smartMergeVideoBtn) smartMergeVideoBtn.disabled = !hasMultiple;
    
    if (hasRegions) {
        let totalDur = 0;
        AppState.allSegments.forEach(s => totalDur += (s.end - s.start));
        if (totalDurationValue) totalDurationValue.textContent = formatTime(totalDur);
        if (totalDurationDisplay) totalDurationDisplay.classList.remove('hidden');
    } else {
        if (totalDurationDisplay) totalDurationDisplay.classList.add('hidden');
    }
    
    if (!hasRegions) {
        segmentsList.innerHTML = '<div class="text-gray-500 text-sm py-8 text-center italic">暂无选区，请在上方波形图上按住鼠标拖拽进行框选。</div>';
        return;
    }
    
    let html = '';
    AppState.allSegments.forEach((seg, index) => {
        const startStr = formatTime(seg.start);
        const endStr = formatTime(seg.end);
        const durStr = formatTime(seg.end - seg.start);
        const isCurrentVideo = seg.videoIndex === AppState.currentVideoIndex;
        const safeVideoName = escapeHTML(seg.videoName);
        
        html += `
        <div class="flex flex-col xl:flex-row xl:items-center justify-between p-3 border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors gap-2 ${isCurrentVideo ? 'bg-indigo-900/20' : ''}">
            <div class="flex items-center gap-3 flex-wrap">
                <span class="w-6 h-6 rounded-full bg-indigo-900 text-indigo-300 flex items-center justify-center text-xs font-bold">${index + 1}</span>
                <span class="video-source-tag" title="${safeVideoName}">${safeVideoName}</span>
                <div class="flex flex-wrap gap-3 text-sm font-mono text-gray-300">
                    <span><span class="text-gray-500">起:</span>${startStr}</span>
                    <span><span class="text-gray-500">止:</span>${endStr}</span>
                    <span class="text-green-400"><span class="text-gray-500">长:</span>${durStr}</span>
                </div>
            </div>
            <div class="flex items-center gap-1 flex-wrap">
                <button onclick="window.playSegment(${seg.videoIndex}, '${seg.id}')" class="p-1.5 text-gray-400 hover:text-white hover:bg-gray-600 rounded" title="播放预览"><i data-lucide="play" class="w-4 h-4"></i></button>
                <button onclick="window.pauseSegment()" class="p-1.5 text-gray-400 hover:text-white hover:bg-gray-600 rounded" title="暂停"><i data-lucide="pause" class="w-4 h-4"></i></button>
                <div class="w-px h-4 bg-gray-600 mx-1"></div>
                <button onclick="window.exportSingleAudio(${seg.videoIndex}, '${seg.id}', ${index+1})" class="text-xs p-1.5 text-emerald-400 hover:text-white hover:bg-emerald-600 rounded flex items-center gap-1" title="导出音频"><i data-lucide="music" class="w-3 h-3"></i></button>
                <button onclick="window.smartExportSingleVideo(${seg.videoIndex}, '${seg.id}', ${index+1})" class="text-xs px-2 py-1.5 text-indigo-300 hover:text-white hover:bg-indigo-600 rounded flex items-center gap-1" title="导出视频"><i data-lucide="download" class="w-3 h-3"></i> 导出</button>
                <div class="w-px h-4 bg-gray-600 mx-1"></div>
                <button onclick="window.removeSegment(${seg.videoIndex}, '${seg.id}')" class="p-1.5 text-red-400 hover:text-white hover:bg-red-600 rounded" title="删除选区"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
            </div>
        </div>`;
    });
    segmentsList.innerHTML = html;
    lucide.createIcons();
}

window.playSegment = (vIdx, segId) => {
    if (vIdx !== AppState.currentVideoIndex) {
        saveCurrentSegments();
        if (switchToVideoCallback) switchToVideoCallback(vIdx);
        setTimeout(() => {
            const seg = AppState.videoFiles[vIdx].segments.find(s => s.id === segId);
            if (seg) {
                const videoPlayer = document.getElementById('videoPlayer');
                videoPlayer.currentTime = seg.start;
                videoPlayer.play();
            }
        }, 500);
    } else {
        const seg = AppState.videoFiles[vIdx].segments.find(s => s.id === segId);
        if (seg) {
            const videoPlayer = document.getElementById('videoPlayer');
            videoPlayer.currentTime = seg.start;
            videoPlayer.play();
        }
    }
};

window.pauseSegment = () => {
    const videoPlayer = document.getElementById('videoPlayer');
    videoPlayer.pause();
};

window.removeSegment = (vIdx, segId) => {
    if (vIdx === AppState.currentVideoIndex) {
        const r = AppState.wsRegions.getRegions().find(x => x.id === segId);
        if (r) r.remove();
    } else {
        const segIdx = AppState.videoFiles[vIdx].segments.findIndex(s => s.id === segId);
        if (segIdx !== -1) {
            AppState.videoFiles[vIdx].segments.splice(segIdx, 1);
            renderAllSegments();
        }
    }
};

export function highlightRegionAtTime(start, end) {
    if (!AppState.wsRegions) return;
    clearHighlightRegion();
    const duration = AppState.wavesurfer.getDuration();
    const safeStart = Math.max(0, Math.min(start, duration - 0.1));
    const safeEnd = Math.max(safeStart + 0.1, Math.min(end, duration));
    AppState.highlightRegion = AppState.wsRegions.addRegion({
        start: safeStart, end: safeEnd, color: 'rgba(147, 51, 234, 0.2)', drag: false, resize: false, isHighlight: true
    });
}

export function clearHighlightRegion() {
    if (AppState.highlightRegion) {
        AppState.highlightRegion.remove();
        AppState.highlightRegion = null;
    }
}

export function addRegionAtTime(start, end, color = 'rgba(147, 51, 234, 0.4)') {
    if (!AppState.wsRegions) return;
    const duration = AppState.wavesurfer.getDuration();
    const safeStart = Math.max(0, Math.min(start, duration - 0.1));
    const safeEnd = Math.max(safeStart + 0.1, Math.min(end, duration));
    if (checkRegionOverlap({ start: safeStart, end: safeEnd, id: `temp_${Date.now()}` })) return;
    const region = AppState.wsRegions.addRegion({ start: safeStart, end: safeEnd, color: color, drag: true, resize: true });
    region.lastValidStart = region.start;
    region.lastValidEnd = region.end;
    document.getElementById('videoPlayer').currentTime = safeStart;
    renderAllSegments();
}

export function initWaveSurfer(url, savedSegments = []) {
    if (AppState.wavesurfer) {
        AppState.wavesurfer.destroy();
        AppState.wavesurfer = null;
        AppState.wsRegions = null;
    }
    AppState.currentZoom = 1;
    const waveformLoading = document.getElementById('waveformLoading');
    const waveformProgressText = document.getElementById('waveformProgressText');
    waveformLoading.classList.remove('hidden');
    waveformProgressText.textContent = '正在解析音频流...';

    const WaveSurfer = window.WaveSurfer;
    const RegionsPlugin = window.RegionsPlugin;
    const TimelinePlugin = window.TimelinePlugin;
    const HoverPlugin = window.HoverPlugin;

    AppState.wavesurfer = WaveSurfer.create({
        container: '#waveform', 
        waveColor: '#4F46E5', 
        progressColor: '#818CF8', 
        url: url, 
        media: document.getElementById('videoPlayer'),
        height: 120, 
        barWidth: 2, 
        barGap: 1, 
        barRadius: 2, 
        cursorColor: '#F87171',
        plugins: [
            TimelinePlugin.create({ container: '#timeline', height: 20, style: { color: '#9CA3AF' } }),
            HoverPlugin.create({ lineBaseColor: '#ffffff', lineWidth: 2, labelBackground: '#111827', labelColor: '#fff' })
        ]
    });
    
    AppState.wsRegions = AppState.wavesurfer.registerPlugin(RegionsPlugin.create());
    AppState.wsRegions.enableDragSelection({ color: 'rgba(99, 102, 241, 0.4)' });

    AppState.wavesurfer.on('loading', (percent) => {
        waveformLoading.classList.remove('hidden');
        waveformProgressText.textContent = `正在生成波形视图 ${percent}% ...`;
    });

    AppState.wavesurfer.on('decode', () => {
        waveformLoading.classList.add('hidden');
        if (savedSegments.length > 0) {
            savedSegments.forEach(seg => {
                const region = AppState.wsRegions.addRegion({ start: seg.start, end: seg.end, color: seg.color, drag: true, resize: true });
                region.lastValidStart = seg.start;
                region.lastValidEnd = seg.end;
            });
        }
        renderAllSegments();
        document.getElementById('transcribeBtn').disabled = false;
    });

    AppState.wsRegions.on('region-created', (region) => {
        if (region.isHighlight) return;
        
        region.lastValidStart = region.start;
        region.lastValidEnd = region.end;
        const hasTranscription = AppState.transcriptionResult && AppState.transcriptionResult.chunks && AppState.transcriptionResult.chunks.length > 0;
        if (!region.isRestoring && hasTranscription) {
            AppState.isPreviewMode = true;
            AppState.pendingPreviewRegion = region;
            if (updateTranscriptionHighlightCallback) updateTranscriptionHighlightCallback();
        } else {
            renderAllSegments();
            if (window.saveCurrentWorkspace) window.saveCurrentWorkspace();
        }
    });
    
    AppState.wsRegions.on('region-update-start', (region) => { region.dragStartState = { start: region.start, end: region.end }; });
    
    AppState.wsRegions.on('region-updating', (region) => {
        const tempRegion = { start: region.start, end: region.end, id: region.id };
        if (checkRegionOverlap(tempRegion)) {
            region.setOptions({ start: region.dragStartState.start, end: region.dragStartState.end });
        } else {
            region.lastValidStart = region.start;
            region.lastValidEnd = region.end;
        }
        if (AppState.transcriptionResult && AppState.transcriptionResult.chunks && updateTranscriptionHighlightCallback) {
            updateTranscriptionHighlightCallback({ start: region.start, end: region.end });
        }
    });
    
    AppState.wsRegions.on('region-updated', (region) => {
        const tempRegion = { start: region.start, end: region.end, id: region.id };
        if (checkRegionOverlap(tempRegion)) {
            region.setOptions({ start: region.lastValidStart, end: region.lastValidEnd });
            return;
        }
        region.lastValidStart = region.start;
        region.lastValidEnd = region.end;
        if (!AppState.isPreviewMode) {
            renderAllSegments();
            if (AppState.transcriptionResult && AppState.transcriptionResult.chunks && updateTranscriptionHighlightCallback) {
                updateTranscriptionHighlightCallback();
            }
            if (window.saveCurrentWorkspace) window.saveCurrentWorkspace();
        }
    });
    
    AppState.wsRegions.on('region-removed', (region) => {
        if (region && region.isHighlight) return;
        
        renderAllSegments();
        if (AppState.transcriptionResult && AppState.transcriptionResult.chunks && updateTranscriptionHighlightCallback) {
            updateTranscriptionHighlightCallback();
        }
        if (window.saveCurrentWorkspace) window.saveCurrentWorkspace();
    });
    AppState.wsRegions.on('region-clicked', (region, e) => { e.stopPropagation(); });
    
    document.getElementById('waveform').addEventListener('wheel', (e) => {
        if (e.ctrlKey && AppState.wavesurfer) {
            e.preventDefault();
            const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, AppState.currentZoom * (e.deltaY > 0 ? 0.9 : 1.1)));
            AppState.currentZoom = newZoom;
            AppState.wavesurfer.zoom(newZoom);
        }
    }, { passive: false });
}
