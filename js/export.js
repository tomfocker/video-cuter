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

async function safeDeleteFile(path) {
    if (!path) return;
    try {
        await AppState.ffmpeg.deleteFile(path);
    } catch (e) {}
}

async function safeUnmountDir(path) {
    if (!path) return;
    try {
        await AppState.ffmpeg.unmount(path);
    } catch (e) {}
    try {
        await AppState.ffmpeg.deleteDir(path);
    } catch (e) {}
}

const MERGE_OUTPUT_EXT = 'mp4';
const MERGE_PRIMARY_VIDEO_ARGS = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p'];
const MERGE_FALLBACK_VIDEO_ARGS = ['-c:v', 'mpeg4', '-q:v', '2'];
const MERGE_AUDIO_ARGS = ['-c:a', 'aac', '-b:a', '192k'];

async function buildMergeInputs(segmentsWithFiles, mountFile) {
    const orderedFiles = [];
    const seen = new Set();

    for (const seg of segmentsWithFiles) {
        if (!seen.has(seg.videoFile)) {
            seen.add(seg.videoFile);
            orderedFiles.push(seg.videoFile);
        }
    }

    return Promise.all(orderedFiles.map(async (file, index) => ({
        file,
        inputIndex: index,
        inputPath: await mountFile(file)
    })));
}

function buildMergeFilterGraph(segments, inputIndexByFile) {
    const parts = [];
    const concatInputs = [];

    segments.forEach((seg, index) => {
        const inputIndex = inputIndexByFile.get(seg.videoFile);
        const videoLabel = `v${index}`;
        const audioLabel = `a${index}`;

        if (inputIndex === undefined) {
            return;
        }

        parts.push(
            `[${inputIndex}:v:0]trim=start=${seg.start}:end=${seg.end},setpts=PTS-STARTPTS[${videoLabel}]`
        );
        parts.push(
            `[${inputIndex}:a:0]atrim=start=${seg.start}:end=${seg.end},asetpts=PTS-STARTPTS[${audioLabel}]`
        );
        concatInputs.push(`[${videoLabel}][${audioLabel}]`);
    });

    parts.push(`${concatInputs.join('')}concat=n=${concatInputs.length}:v=1:a=1[v][a]`);
    return parts.join(';');
}

function buildFinalMergeArgs(inputPaths, filterGraph, outputName, videoArgs) {
    return [
        ...inputPaths.flatMap((inputPath) => ['-i', inputPath]),
        '-filter_complex', filterGraph,
        '-map', '[v]',
        '-map', '[a]',
        ...videoArgs,
        ...MERGE_AUDIO_ARGS,
        '-movflags', '+faststart',
        outputName
    ];
}

async function mergeEncodedSegments(inputPaths, filterGraph, outputName) {
    const profiles = [
        { label: 'H.264/AAC', videoArgs: MERGE_PRIMARY_VIDEO_ARGS },
        { label: 'MPEG4/AAC', videoArgs: MERGE_FALLBACK_VIDEO_ARGS }
    ];

    for (let i = 0; i < profiles.length; i++) {
        const profile = profiles[i];
        const args = buildFinalMergeArgs(inputPaths, filterGraph, outputName, profile.videoArgs);
        log(`[合并视频 | ${profile.label}]: ffmpeg ${args.join(' ')}`, true);

        const err = await AppState.ffmpeg.exec(args);
        if (err === 0) {
            return true;
        }

        await safeDeleteFile(outputName);
        if (i < profiles.length - 1) {
            log('最终合并失败，尝试备用编码配置...', true);
        }
    }

    return false;
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

    const mountedInputs = new Map();
    const tempOutputFiles = new Set();

    try {
        const sourceExt = segmentsWithFiles[0].videoFile.name.split('.').pop() || 'mp4';
        const outputExt = isMerge ? MERGE_OUTPUT_EXT : sourceExt;
        let mountCounter = 0;
        
        const mountFile = async (file) => {
            if (mountedInputs.has(file)) {
                return mountedInputs.get(file).inputPath;
            }

            const index = mountCounter++;
            const inputDir = `/input_${index}`;
            try { await AppState.ffmpeg.createDir(inputDir); } catch(e) {}
            try {
                await AppState.ffmpeg.mount('WORKERFS', { files: [file] }, inputDir);
                const inputPath = `${inputDir}/${file.name}`;
                mountedInputs.set(file, { inputDir, inputPath });
                log(`挂载文件: ${file.name} -> ${inputDir}`, true);
                return inputPath;
            } catch(e) {
                log(`挂载失败: ${e.message}`, true);
                return null;
            }
        };

        if (!isMerge) {
            for (let k = 0; k < segmentsWithFiles.length; k++) {
                const seg = segmentsWithFiles[k];
                const fileIndex = indicesArray[k];
                const outputName = `out_${k}.${outputExt}`;
                tempOutputFiles.add(outputName);
                
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
                downloadBlob(new Blob([data.buffer], { type: "application/octet-stream" }), `segment_${fileIndex}_${Math.floor(Date.now()/1000)}.${outputExt}`);
                await safeDeleteFile(outputName);
                tempOutputFiles.delete(outputName);
            }
            log('视频批量导出完成！', true);
        } else {
            let outputName = null;

            log('合并导出将直接从源文件裁剪并在一次最终编码中完成拼接。', true);
            log('这样可以减少中间文件读写，并保留稳定的重新建时轴流程。', true);

            const mergeInputs = await buildMergeInputs(segmentsWithFiles, mountFile);
            const usableInputs = mergeInputs.filter(({ inputPath }) => Boolean(inputPath));
            if (usableInputs.length === 0) {
                throw new Error('没有成功挂载任何输入文件！');
            }

            const inputIndexByFile = new Map(usableInputs.map(({ file, inputIndex }) => [file, inputIndex]));
            const inputPaths = usableInputs.map(({ inputPath }) => inputPath);
            const filterGraph = buildMergeFilterGraph(segmentsWithFiles, inputIndexByFile);

            log('正在合并片段...', true);
            outputName = `merged_${Date.now()}.${outputExt}`;
            tempOutputFiles.add(outputName);

            if (await mergeEncodedSegments(inputPaths, filterGraph, outputName)) {
                const data = await AppState.ffmpeg.readFile(outputName);
                downloadBlob(new Blob([data.buffer], { type: "application/octet-stream" }), `merged_${Math.floor(Date.now()/1000)}.${outputExt}`);
                log('视频合并成功！', true);
            } else {
                throw new Error('视频合并失败');
            }
        }
    } catch (err) {
        log(`[异常] ${err.message || err}`);
        console.error(err);
    } finally {
        for (const filePath of tempOutputFiles) {
            await safeDeleteFile(filePath);
        }
        for (const { inputDir } of mountedInputs.values()) {
            await safeUnmountDir(inputDir);
        }
        log('任务完成，清理资源。', true);
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
