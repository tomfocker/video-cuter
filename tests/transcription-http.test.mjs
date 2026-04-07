import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from './module-loader.mjs';

function createLocalStorage(initial = {}) {
    const store = new Map(Object.entries(initial));
    return {
        getItem(key) {
            return store.has(key) ? store.get(key) : null;
        },
        setItem(key, value) {
            store.set(key, String(value));
        },
        removeItem(key) {
            store.delete(key);
        }
    };
}

test('state defaults ASR endpoint to local HTTP service', () => {
    const localStorage = createLocalStorage();
    const { AppState } = loadModule(
        path.resolve('js/state.js'),
        {
            localStorage,
            window: {}
        },
        ['AppState']
    );

    assert.equal(AppState.serverApiUrl, 'http://127.0.0.1:8000');
});

test('state prefers runtime config server api url when provided', () => {
    const localStorage = createLocalStorage();
    const { AppState } = loadModule(
        path.resolve('js/state.js'),
        {
            localStorage,
            window: {
                __CUT_CONFIG__: {
                    serverApiUrl: ''
                }
            }
        },
        ['AppState']
    );

    assert.equal(AppState.serverApiUrl, '');
});

test('normalizeTranscriptionResult adapts backend verbose_json payload for cut', () => {
    const { normalizeTranscriptionResult } = loadModule(
        path.resolve('js/websocket.js'),
        {
            AppState: {},
            ws: null,
            setWs() {},
            renderTranscriptionText() {},
            escapeHTML(value) {
                return value;
            },
            document: { getElementById() { return null; } },
            window: {},
            console,
            setTimeout,
            clearTimeout
        },
        ['normalizeTranscriptionResult']
    );

    const result = normalizeTranscriptionResult({
        text: '你好，世界今天测试字幕下载功能。',
        segments: [
            { id: 0, start: 0, end: 0.1, text: '你' },
            { id: 1, start: 0.06, end: 0.21, text: '好' }
        ],
        subtitle_segments: [
            { id: 0, start: 0, end: 0.285, text: '你好' },
            { id: 1, start: 0.36, end: 3.67, text: '世界今天测试字幕下载功能' }
        ],
        srt: '1\n00:00:00,000 --> 00:00:00,285\n你好\n'
    });

    assert.equal(result.text, '你好，世界今天测试字幕下载功能。');
    assert.equal(result.segments.length, 2);
    assert.equal(result.subtitleSegments.length, 2);
    assert.equal(result.displayChunks.length, 2);
    assert.deepEqual(result.displayChunks[0].timestamp, [0, 0.285]);
    assert.equal(result.displayChunks[1].text, '世界今天测试字幕下载功能');
    assert.equal(result.srt.includes('00:00:00,285'), true);
    assert.equal(result.chunks.length, 2);
});

test('buildHealthcheckUrl always targets healthz endpoint', () => {
    const { buildHealthcheckUrl } = loadModule(
        path.resolve('js/websocket.js'),
        {
            AppState: {},
            ws: null,
            setWs() {},
            renderTranscriptionText() {},
            escapeHTML(value) {
                return value;
            },
            document: { getElementById() { return null; } },
            window: {},
            console,
            setTimeout,
            clearTimeout
        },
        ['buildHealthcheckUrl']
    );

    assert.equal(buildHealthcheckUrl('http://127.0.0.1:8000'), 'http://127.0.0.1:8000/healthz');
    assert.equal(buildHealthcheckUrl('http://127.0.0.1:8000/'), 'http://127.0.0.1:8000/healthz');
    assert.equal(buildHealthcheckUrl('http://127.0.0.1:8000/v1/audio/transcriptions'), 'http://127.0.0.1:8000/healthz');
});

test('buildServerHelpState recommends same-origin proxy for bundled deployment', () => {
    const { buildServerHelpState } = loadModule(
        path.resolve('js/websocket.js'),
        {
            AppState: {},
            ws: null,
            setWs() {},
            renderTranscriptionText() {},
            escapeHTML(value) {
                return value;
            },
            document: { getElementById() { return null; } },
            window: {},
            console,
            setTimeout,
            clearTimeout
        },
        ['buildServerHelpState']
    );

    const help = buildServerHelpState('/api/asr');
    assert.match(help.summary, /同源代理/);
    assert.equal(help.items.some((item) => /\/api\/asr/.test(item)), true);
});

test('buildServerHelpState warns that docker service names are not browser endpoints', () => {
    const { buildServerHelpState } = loadModule(
        path.resolve('js/websocket.js'),
        {
            AppState: {},
            ws: null,
            setWs() {},
            renderTranscriptionText() {},
            escapeHTML(value) {
                return value;
            },
            document: { getElementById() { return null; } },
            window: {},
            console,
            setTimeout,
            clearTimeout
        },
        ['buildServerHelpState']
    );

    const help = buildServerHelpState('http://asr:8000', 'fetch failed');
    assert.match(help.summary, /浏览器/);
    assert.equal(help.items.some((item) => /Docker 服务名/.test(item)), true);
    assert.equal(help.items.some((item) => /127\.0\.0\.1:18000/.test(item)), true);
});

test('resolveSrtContent prefers backend srt before local fallback generation', () => {
    const { resolveSrtContent } = loadModule(
        path.resolve('js/utils.js'),
        {
            Blob,
            URL,
            document: {
                createElement() {
                    return {
                        click() {},
                        remove() {}
                    };
                },
                body: {
                    appendChild() {},
                    removeChild() {}
                }
            }
        },
        ['resolveSrtContent']
    );

    const backendSrt = '1\n00:00:00,000 --> 00:00:01,000\n你好\n';
    assert.equal(
        resolveSrtContent({
            srt: backendSrt,
            displayChunks: [
                { text: '不该走到这里', timestamp: [0, 1] }
            ]
        }),
        backendSrt
    );
});

test('resolveSrtContent falls back to normalized display chunks', () => {
    const { resolveSrtContent } = loadModule(
        path.resolve('js/utils.js'),
        {
            Blob,
            URL,
            document: {
                createElement() {
                    return {
                        click() {},
                        remove() {}
                    };
                },
                body: {
                    appendChild() {},
                    removeChild() {}
                }
            }
        },
        ['resolveSrtContent']
    );

    const srt = resolveSrtContent({
        displayChunks: [
            { text: '你好', timestamp: [0, 0.4] },
            { text: '世界', timestamp: [0.5, 1.3] }
        ]
    });

    assert.match(srt, /00:00:00,000 --> 00:00:00,400/);
    assert.match(srt, /你好/);
    assert.match(srt, /世界/);
});

test('mergeSelections combines adjacent selection ranges into a continuous region', () => {
    const { mergeSelections } = loadModule(
        path.resolve('js/transcription.js'),
        {
            AppState: {},
            highlightRegionAtTime() {},
            clearHighlightRegion() {},
            addRegionAtTime() {},
            setWaveformCallbacks() {},
            renderAllSegments() {},
            clearAllSegments() {},
            escapeHTML(value) {
                return value;
            },
            document: { getElementById() { return null; }, querySelectorAll() { return []; } },
            window: {},
            console,
            setTimeout
        },
        ['mergeSelections']
    );

    const merged = mergeSelections([
        { start: 0, end: 0.4, startIdx: 0, endIdx: 0, text: '你好' },
        { start: 0.4, end: 1.2, startIdx: 1, endIdx: 1, text: '世界' },
        { start: 2, end: 3, startIdx: 3, endIdx: 3, text: '下一段' }
    ]);

    assert.equal(merged.length, 2);
    assert.deepEqual(merged[0], {
        start: 0,
        end: 1.2,
        startIdx: 0,
        endIdx: 1,
        text: '你好世界'
    });
});

test('index.html includes required ASR settings and subtitle controls', () => {
    const html = fs.readFileSync(path.resolve('index.html'), 'utf8');

    assert.match(html, /id="serverSettingsModal"/);
    assert.match(html, /id="serverApiInput"/);
    assert.match(html, /id="connectionStatus"/);
    assert.match(html, /id="downloadSrtBtn"/);
    assert.match(html, /id="downloadBilingualSrtBtn"/);
    assert.match(html, /id="clearPendingSelectionsBtn"/);
    assert.match(html, /id="pendingSelectionCount"/);
    assert.match(html, /id="resetTranscriptionBtn"/);
    assert.match(html, /id="serverPresetProxyBtn"/);
    assert.match(html, /id="serverPresetLocalBtn"/);
    assert.match(html, /id="serverPresetBundleBtn"/);
    assert.match(html, /id="serverHelpSummary"/);
    assert.match(html, /id="serverHelpList"/);
    assert.match(html, /<script src="\.\/config\.js"><\/script>/);
});

test('Caddyfile exposes static app and proxied ASR endpoints for bundle deployment', () => {
    const caddyfile = fs.readFileSync(path.resolve('Caddyfile'), 'utf8');

    assert.match(caddyfile, /handle_path\s+\/api\/asr\/\*/);
    assert.match(caddyfile, /handle\s+\/healthz/);
    assert.match(caddyfile, /handle\s+\/v1\/audio\/transcriptions/);
    assert.match(caddyfile, /handle\s+\/api\/transcriptions/);
    assert.match(caddyfile, /reverse_proxy\s+\{\$CUT_ASR_UPSTREAM\}/);
});

test('repository includes GitHub Pages deployment workflow and demo link', () => {
    const workflowPath = path.resolve('.github/workflows/pages.yml');
    const workflow = fs.readFileSync(workflowPath, 'utf8');
    const readme = fs.readFileSync(path.resolve('README.md'), 'utf8');

    assert.match(workflow, /actions\/configure-pages@/);
    assert.match(workflow, /actions\/upload-pages-artifact@/);
    assert.match(workflow, /actions\/deploy-pages@/);
    assert.match(readme, /https:\/\/tomfocker\.github\.io\/video-cuter\//);
    assert.match(readme, /GitHub Pages/i);
    assert.match(readme, /Settings\s*>\s*Pages/i);
    assert.match(readme, /GitHub Actions/i);
});
