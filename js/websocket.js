import { AppState, ws, setWs } from './state.js';
import { renderTranscriptionText } from './transcription.js';
import { escapeHTML } from './utils.js';

function getTty() { return document.getElementById('tty'); }
function getFfmpegProgressBar() { return document.getElementById('ffmpegProgressBar'); }

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

function bytesToBase64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

export function updateTranscribeStatus() {
    const transcribeBtn = document.getElementById('transcribeBtn');
    const transcribeStatus = document.getElementById('transcribeStatus');
    if (!transcribeBtn) return;
    if (AppState.currentVideoIndex === -1 || !AppState.wavesurfer) {
        transcribeBtn.disabled = true;
        if (transcribeStatus) transcribeStatus.textContent = '请先加载视频';
        return;
    }
    if (ws && ws.readyState === WebSocket.OPEN) {
        transcribeBtn.disabled = false;
        if (transcribeStatus) {
            transcribeStatus.textContent = '已连接到语音识别服务';
            transcribeStatus.className = 'text-xs text-green-400';
        }
    } else {
        transcribeBtn.disabled = true;
        if (transcribeStatus) {
            transcribeStatus.textContent = '未连接到语音识别服务，请先配置';
            transcribeStatus.className = 'text-xs text-yellow-400';
        }
    }
}

export function connectToServer() {
    if (ws) ws.close();
    const connectionStatus = document.getElementById('connectionStatus');
    if (connectionStatus) {
        connectionStatus.textContent = '连接中...';
        connectionStatus.className = 'text-xs text-center text-gray-400';
        connectionStatus.classList.remove('hidden');
    }
    
    let wsUrl = AppState.serverApiUrl;
    if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
        wsUrl = wsUrl.replace(/^http/, 'ws');
    }
    
    try {
        const newWs = new WebSocket(wsUrl, ['binary']);
        setWs(newWs);
        
        newWs.onopen = () => { 
            if (connectionStatus) {
                connectionStatus.textContent = '✓ 连接成功！'; 
                connectionStatus.className = 'text-xs text-center text-green-400'; 
            }
            updateTranscribeStatus(); 
        };
        newWs.onclose = () => { 
            if (connectionStatus) {
                connectionStatus.textContent = '连接已断开'; 
                connectionStatus.className = 'text-xs text-center text-yellow-400'; 
            }
            updateTranscribeStatus(); 
        };
        newWs.onerror = () => { 
            if (connectionStatus) {
                connectionStatus.textContent = '✗ 连接失败'; 
                connectionStatus.className = 'text-xs text-center text-red-400'; 
            }
            updateTranscribeStatus(); 
        };
    } catch (err) {
        if (connectionStatus) {
            connectionStatus.textContent = `✗ 连接失败: ${err.message}`;
            connectionStatus.className = 'text-xs text-center text-red-400';
        }
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
    
    let wsInstance = null;
    let inputDir = null;
    let audioOutput = null;
    let timeoutId = null;
    
    try {
        const videoFile = AppState.videoFiles[AppState.currentVideoIndex];
        
        log('正在提取音频...', true);
        if (transcribeStatus) transcribeStatus.textContent = '提取音频中...';
        if (loadingText) loadingText.textContent = '提取音频中...';
        
        inputDir = `/transcribe_input_${AppState.currentVideoIndex}`;
        try { await AppState.ffmpeg.createDir(inputDir); } catch(e) {}
        
        try {
            await AppState.ffmpeg.mount('WORKERFS', { files: [videoFile.file] }, inputDir);
        } catch(e) {
            log(`挂载失败: ${e.message}`, true);
            throw e;
        }
        
        const inputPath = `${inputDir}/${videoFile.file.name}`;
        audioOutput = 'audio_for_transcribe.raw';
        
        const audioArgs = ['-i', inputPath, '-vn', '-acodec', 'pcm_f32le', '-ar', '16000', '-ac', '1', '-f', 'f32le', audioOutput];
        log(`[提取音频]: ffmpeg ${audioArgs.join(' ')}`, true);
        
        const err = await AppState.ffmpeg.exec(audioArgs);
        if (err !== 0) {
            throw new Error('音频提取失败');
        }
        
        log('音频提取成功，正在连接服务端...', true);
        if (transcribeStatus) transcribeStatus.textContent = '连接服务端...';
        if (loadingText) loadingText.textContent = '连接服务端...';
        if (progressBar) progressBar.style.width = '20%';
        
        const audioData = await AppState.ffmpeg.readFile(audioOutput);
        const audioBytes = new Uint8Array(audioData.buffer);
        
        const taskId = `task_${Date.now()}`;
        let wsUrl = AppState.serverApiUrl;
        
        if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
            wsUrl = wsUrl.replace(/^http/, 'ws');
        }
        
        if (location.protocol === 'https:' && wsUrl.startsWith('ws://')) {
            throw new Error('HTTPS 页面无法连接 ws://。请使用 ngrok 获取 wss:// 地址');
        }
        
        log(`正在连接 WebSocket: ${wsUrl}`, true);
        
        const result = await new Promise((resolve, reject) => {
            wsInstance = new WebSocket(wsUrl, ['binary']);
            let resultChunks = [];
            let resultText = '';
            let totalDuration = 0;
            let lastTokenCount = 0;
            let isResolved = false;
            
            const doResolve = (result) => {
                if (!isResolved) {
                    isResolved = true;
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                        timeoutId = null;
                    }
                    resolve(result);
                }
            };
            
            const doReject = (error) => {
                if (!isResolved) {
                    isResolved = true;
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                        timeoutId = null;
                    }
                    reject(error);
                }
            };
            
            wsInstance.onopen = () => {
                log('WebSocket 连接成功，发送音频数据...', true);
                if (transcribeStatus) transcribeStatus.textContent = '发送音频...';
                if (loadingText) loadingText.textContent = '发送音频...';
                if (progressBar) progressBar.style.width = '30%';
                
                const chunkSize = 16000 * 4 * 30;
                const totalChunks = Math.ceil(audioBytes.length / chunkSize);
                
                for (let offset = 0; offset < audioBytes.length; offset += chunkSize) {
                    const chunk = audioBytes.subarray(offset, Math.min(offset + chunkSize, audioBytes.length));
                    const chunkBase64 = bytesToBase64(chunk);
                    
                    const message = {
                        source: 'file',
                        is_final: false,
                        task_id: taskId,
                        data: chunkBase64,
                        seg_duration: 30,
                        seg_overlap: 2,
                        time_start: Date.now() / 1000
                    };
                    
                    wsInstance.send(JSON.stringify(message));
                }
                
                const finalMessage = {
                    source: 'file',
                    is_final: true,
                    task_id: taskId,
                    data: '',
                    seg_duration: 30,
                    seg_overlap: 2,
                    time_start: Date.now() / 1000
                };
                
                wsInstance.send(JSON.stringify(finalMessage));
                
                log(`已发送 ${totalChunks} 个音频块，等待识别...`, true);
                if (transcribeStatus) transcribeStatus.textContent = '识别中...';
                if (loadingText) loadingText.textContent = '识别中...';
                if (progressBar) progressBar.style.width = '50%';
            };
            
            wsInstance.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    console.log('[WebSocket] 收到消息:', msg);
                    
                    if (msg.duration) {
                        totalDuration = msg.duration;
                        if (loadingText) loadingText.textContent = `识别中... ${msg.duration.toFixed(1)}s`;
                    }
                    
                    if (msg.text) {
                        resultText = msg.text;
                        console.log('[WebSocket] 更新文本:', resultText.length, '字符');
                    }
                    
                    if (msg.tokens && msg.timestamps && msg.tokens.length > 0) {
                        if (msg.tokens.length > lastTokenCount) {
                            resultChunks = [];
                            for (let i = 0; i < msg.tokens.length; i++) {
                                const token = msg.tokens[i].replace('@', '');
                                const timestamp = msg.timestamps[i];
                                if (token && timestamp !== undefined) {
                                    resultChunks.push({
                                        text: token,
                                        timestamp: [timestamp, timestamp + 0.2]
                                    });
                                }
                            }
                            lastTokenCount = msg.tokens.length;
                            console.log('[WebSocket] 更新 chunks:', resultChunks.length, '个');
                        }
                    }
                    
                    if (msg.is_final) {
                        console.log('[WebSocket] 收到 is_final, 结果:', { text: resultText.length, chunks: resultChunks.length });
                        wsInstance.close();
                        doResolve({
                            text: resultText,
                            chunks: resultChunks
                        });
                    }
                } catch (e) {
                    console.error('解析消息失败:', e);
                }
            };
            
            wsInstance.onerror = (error) => {
                log(`WebSocket 错误`, true);
                doReject(new Error('WebSocket 连接错误'));
            };
            
            wsInstance.onclose = (event) => {
                if (!isResolved) {
                    if (event.wasClean) {
                        log('服务端关闭连接，返回识别结果', true);
                        doResolve({
                            text: resultText,
                            chunks: resultChunks
                        });
                    } else {
                        doReject(new Error('连接异常关闭'));
                    }
                }
            };
            
            timeoutId = setTimeout(() => {
                doReject(new Error('识别超时'));
            }, 300000);
        });
        
        log('语音识别完成', true);
        if (progressBar) progressBar.style.width = '100%';
        
        AppState.transcriptionResults[AppState.currentVideoIndex] = result;
        AppState.transcriptionResult = result;
        renderTranscriptionText(result);
        updateTranscribeStatus();
        if (transcriptionLoading) transcriptionLoading.classList.add('hidden');
        if (transcribeBtn) transcribeBtn.disabled = false;
    } catch (err) {
        log(`[错误] ${err.message}`, true);
        if (transcriptionText) transcriptionText.innerHTML = `<span class="text-red-400">识别失败: ${escapeHTML(err.message)}</span>`;
        if (transcriptionContent) transcriptionContent.classList.remove('hidden');
        if (transcriptionLoading) transcriptionLoading.classList.add('hidden');
        if (transcribeBtn) transcribeBtn.disabled = false;
        
        if (wsInstance && wsInstance.readyState === WebSocket.OPEN) {
            wsInstance.close();
        }
    } finally {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        if (audioOutput) {
            try { await AppState.ffmpeg.deleteFile(audioOutput); } catch (e) {}
        }
        if (inputDir) {
            try { await AppState.ffmpeg.unmount(inputDir); } catch (e) {}
            try { await AppState.ffmpeg.deleteDir(inputDir); } catch (e) {}
        }
    }
}
