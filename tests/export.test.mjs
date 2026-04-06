import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadModule } from './module-loader.mjs';

function createClassList() {
    const classes = new Set();
    return {
        add(...names) {
            names.forEach((name) => classes.add(name));
        },
        remove(...names) {
            names.forEach((name) => classes.delete(name));
        },
        contains(name) {
            return classes.has(name);
        }
    };
}

function createDocument() {
    const elements = new Map();

    return {
        getElementById(id) {
            if (!elements.has(id)) {
                elements.set(id, {
                    id,
                    innerHTML: '',
                    textContent: '',
                    scrollTop: 0,
                    scrollHeight: 0,
                    disabled: false,
                    classList: createClassList()
                });
            }
            return elements.get(id);
        }
    };
}

function createFfmpegRecorder() {
    const execCalls = [];

    return {
        execCalls,
        api: {
            async createDir() {},
            async mount() {},
            async unmount() {},
            async deleteDir() {},
            async deleteFile() {},
            async writeFile() {},
            async readFile() {
                return new Uint8Array([1, 2, 3]);
            },
            async exec(args) {
                execCalls.push([...args]);
                return 0;
            }
        }
    };
}

test('merge export builds one concat filter graph from source inputs', async () => {
    const document = createDocument();
    const ffmpeg = createFfmpegRecorder();
    const downloads = [];
    const appState = {
        ffmpeg: ffmpeg.api,
        videoFiles: [],
        currentVideoIndex: 0
    };

    const { executeSmartVideoExport } = loadModule(
        path.resolve('js/export.js'),
        {
            AppState: appState,
            downloadBlob(blob, filename) {
                downloads.push({ blob, filename });
            },
            audioBufferToWav() {},
            saveCurrentSegments() {},
            addRegionAtTime() {},
            switchToVideo() {},
            document,
            window: {},
            console,
            setTimeout
        },
        ['executeSmartVideoExport']
    );

    const sourceA = { name: 'a.mp4' };
    const sourceB = { name: 'b.mp4' };
    await executeSmartVideoExport(
        [
            { start: 1, end: 3, videoFile: sourceA },
            { start: 4, end: 7, videoFile: sourceB }
        ],
        [],
        true
    );

    assert.equal(downloads.length, 1);
    assert.equal(ffmpeg.execCalls.length, 1);

    const command = ffmpeg.execCalls[0];
    const filterIndex = command.indexOf('-filter_complex');
    assert.notEqual(filterIndex, -1);
    assert.match(command[filterIndex + 1], /trim=start=1:end=3/);
    assert.match(command[filterIndex + 1], /atrim=start=4:end=7/);
    assert.match(command[filterIndex + 1], /concat=n=2:v=1:a=1/);
});

test('merge export reuses mounted inputs instead of encoding temp fragments', async () => {
    const document = createDocument();
    const ffmpeg = createFfmpegRecorder();
    const appState = {
        ffmpeg: ffmpeg.api,
        videoFiles: [],
        currentVideoIndex: 0
    };

    const { executeSmartVideoExport } = loadModule(
        path.resolve('js/export.js'),
        {
            AppState: appState,
            downloadBlob() {},
            audioBufferToWav() {},
            saveCurrentSegments() {},
            addRegionAtTime() {},
            switchToVideo() {},
            document,
            window: {},
            console,
            setTimeout
        },
        ['executeSmartVideoExport']
    );

    const sourceFile = { name: 'demo.mp4' };
    await executeSmartVideoExport(
        [
            { start: 1.25, end: 3.5, videoFile: sourceFile },
            { start: 5, end: 8.75, videoFile: sourceFile }
        ],
        [],
        true
    );

    assert.equal(ffmpeg.execCalls.length, 1);
    assert.ok(ffmpeg.execCalls[0].includes('/input_0/demo.mp4'));
});
