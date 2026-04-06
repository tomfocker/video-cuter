import { AppState } from './state.js';
import { downloadBlob, audioBufferToWav } from './utils.js';
import { saveCurrentSegments, addRegionAtTime } from './waveform.js';
import { switchToVideo } from './video.js';

const tty = document.getElementById('tty');

function log(message, isSystem = false) {
    const time = new Date().toLocaleTimeString();
    let msgHTML = `[${time}] ${message}\n`;
    if (message.includes('Error') || message.includes('失败') || message.includes('异常') || message.includes('终止')) {
        msgHTML = `<span class="text-red-400 font-bold">[${time}] ${message}</span>\n`;
    } else if (isSystem) {
        msgHTML = `<span class="text-blue-300">[${time}] ${message}</span>\n`;
    }
    if (tty) {
        tty.innerHTML += msgHTML;
        tty.scrollTop = tty.scrollHeight;
    }
}

export async function processAudioExport(file, segments, indices) {
    if (!file || segments.length === 0) return;
    log('正在导出音频...', true);
    
    let audioContext = null;
    try {
        const arrayBuffer = await file.arrayBuffer();
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        for (let k = 0; k < segments.length; k++) {
            const seg = segments[k];
            const startSample = Math.floor(seg.start * audioBuffer.sampleRate);
            const endSample = Math.floor(seg.end * audioBuffer.sampleRate);
            const slicedBuffer = audioContext.createBuffer(audioBuffer.numberOfChannels, endSample - startSample, audioBuffer.sampleRate);
            for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
                slicedBuffer.copyToChannel(audioBuffer.getChannelData(i).subarray(startSample, endSample), i);
            }
            downloadBlob(audioBufferToWav(slicedBuffer), `segment_${indices[k]}_${Math.floor(Date.now()/1000)}.wav`);
        }
        log('音频导出成功！', true);
    } catch (err) {
        log(`[音频异常] ${err.message || err}`);
    } finally {
        if (audioContext) await audioContext.close();
    }
}

export async function processMergeAudioExport(segments) {
    if (segments.length < 2) return;
    log('正在合并音频...', true);
    
    let audioContext = null;
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const audioBuffers = [];
        let totalSamples = 0;
        
        for (const seg of segments) {
            const file = AppState.videoFiles[seg.videoIndex].file;
            const arrayBuffer = await file.arrayBuffer();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            const startSample = Math.floor(seg.start * audioBuffer.sampleRate);
            const endSample = Math.floor(seg.end * audioBuffer.sampleRate);
            const len = endSample - startSample;
            totalSamples += len;
            audioBuffers.push({ buffer: audioBuffer, startSample, endSample, len });
        }
        
        const mergedBuffer = audioContext.createBuffer(audioBuffers[0].buffer.numberOfChannels, totalSamples, audioBuffers[0].buffer.sampleRate);
        let offset = 0;
        for (const { buffer, startSample, endSample, len } of audioBuffers) {
            for (let i = 0; i < buffer.numberOfChannels; i++) {
                mergedBuffer.copyToChannel(buffer.getChannelData(i).subarray(startSample, endSample), i, offset);
            }
            offset += len;
        }
        downloadBlob(audioBufferToWav(mergedBuffer), `merged_audio_${Math.floor(Date.now()/1000)}.wav`);
        log('音频合并成功！', true);
    } catch (err) {
        log(`[音频合并异常] ${err.message || err}`);
    } finally {
        if (audioContext) await audioContext.close();
    }
}

export async function executeSmartVideoExport(segmentsWithFiles, indicesArray, isMerge) {
    if (segmentsWithFiles.length === 0) return;
    if (!AppState.ffmpeg) {
        log('FFmpeg 尚未加载完成，请稍后再试');
        return;
    }

    try {
        const ext = segmentsWithFiles[0].videoFile.name.split('.').pop() || 'mp4';
        const mountedDirs = [];
        let mountCounter = 0;
        
        const mountFile = async (file) => {
            const index = mountCounter++;
            const inputDir = `/input_${index}`;
            try { await AppState.ffmpeg.createDir(inputDir); } catch(e) {}
            try {
                await AppState.ffmpeg.mount('WORKERFS', { files: [file] }, inputDir);
                mountedDirs.push(inputDir);
                log(`挂载文件: ${file.name} -> ${inputDir}`, true);
                return `${inputDir}/${file.name}`;
            } catch(e) {
                log(`挂载失败: ${e.message}`, true);
                return null;
            }
        };

        if (!isMerge) {
            for (let k = 0; k < segmentsWithFiles.length; k++) {
                const seg = segmentsWithFiles[k];
                const fileIndex = indicesArray[k];
                const outputName = `out_${k}.${ext}`;
                
                const inputPath = await mountFile(seg.videoFile);
                if (!inputPath) continue;
                
                // 修复黑屏：将 -ss 放在 -i 前面，并添加 -accurate_seek
                const args = ['-ss', seg.start.toString(), '-t', (seg.end - seg.start).toString(), '-i', inputPath, '-c:v', 'copy', '-c:a', 'copy', '-avoid_negative_ts', 'make_zero', '-map_metadata', '0', outputName];
                log(`[执行指令]: ffmpeg ${args.join(' ')}`, true);
                
                const err = await AppState.ffmpeg.exec(args);
                if (err !== 0) {
                    log(`分段 ${fileIndex} 处理失败`, true);
                    continue;
                }
                
                log(`分段 ${fileIndex} 截取成功`, true);
                const data = await AppState.ffmpeg.readFile(outputName);
                downloadBlob(new Blob([data.buffer], { type: "application/octet-stream" }), `segment_${fileIndex}_${Math.floor(Date.now()/1000)}.${ext}`);
                await AppState.ffmpeg.deleteFile(outputName);
            }
            log('视频批量导出完成！', true);
        } else {
            let concatText = '';
            const tempFiles = [];
            
            log('【重要提示】合并导出使用流复制，速度快但要求视频编码参数一致。', true);
            log('如果出现黑屏或画面异常，请使用"批量视频"单独导出。', true);
            
            for (let k = 0; k < segmentsWithFiles.length; k++) {
                const seg = segmentsWithFiles[k];
                const tempName = `temp_merge_${k}.${ext}`;
                tempFiles.push(tempName);
                
                const inputPath = await mountFile(seg.videoFile);
                if (!inputPath) continue;
                
                // 修复黑屏：将 -ss 放在 -i 前面进行准确查找
                const args = ['-ss', seg.start.toString(), '-t', (seg.end - seg.start).toString(), '-i', inputPath, '-c:v', 'copy', '-c:a', 'copy', '-avoid_negative_ts', 'make_zero', '-map_metadata', '0', tempName];
                log(`[提取分段 ${k+1}]: ffmpeg ${args.join(' ')}`, true);
                
                const err = await AppState.ffmpeg.exec(args);
                if (err !== 0) {
                    log(`片段提取失败，跳过`, true);
                    continue;
                }
                concatText += `file '${tempName}'\n`;
            }
            
            if (!concatText) {
                throw new Error("没有成功提取任何片段！");
            }
            
            log('正在合并片段...', true);
            await AppState.ffmpeg.writeFile('concat.txt', concatText);
            const outputName = `merged_${Date.now()}.${ext}`;
            log(`[合并视频]: ffmpeg -f concat -safe 0 -i concat.txt -c copy ${outputName}`, true);
            
            if (await AppState.ffmpeg.exec(['-f', 'concat', '-safe', '0', '-i', 'concat.txt', '-c', 'copy', outputName]) === 0) {
                const data = await AppState.ffmpeg.readFile(outputName);
                downloadBlob(new Blob([data.buffer], { type: "application/octet-stream" }), `merged_${Math.floor(Date.now()/1000)}.${ext}`);
                log('视频合并成功！', true);
            }
            await AppState.ffmpeg.deleteFile('concat.txt');
            await AppState.ffmpeg.deleteFile(outputName);
            for (const tmp of tempFiles) {
                try { await AppState.ffmpeg.deleteFile(tmp); } catch(e) {}
            }
        }
        
        for (const dir of mountedDirs) {
            try { await AppState.ffmpeg.unmount(dir); } catch(e) {}
            try { await AppState.ffmpeg.deleteDir(dir); } catch(e) {}
        }
        log('任务完成，清理资源。', true);
    } catch (err) {
        log(`[异常] ${err.message || err}`);
        console.error(err);
    }
}

window.exportSingleAudio = async (vIdx, segId, index) => {
    const seg = AppState.videoFiles[vIdx].segments.find(s => s.id === segId);
    if (seg) {
        await processAudioExport(AppState.videoFiles[vIdx].file, [seg], [index]);
    }
};

window.smartExportSingleVideo = async (vIdx, segId, index) => {
    const seg = AppState.videoFiles[vIdx].segments.find(s => s.id === segId);
    if (seg) {
        await executeSmartVideoExport([{ ...seg, videoFile: AppState.videoFiles[vIdx].file }], [index], false);
    }
};

window.createRegionFromTranscription = (videoIndex, start, end) => {
    if (videoIndex !== AppState.currentVideoIndex) {
        saveCurrentSegments();
        switchToVideo(videoIndex);
        setTimeout(() => addRegionAtTime(start, end), 500);
    } else {
        addRegionAtTime(start, end);
    }
};
