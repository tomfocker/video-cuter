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

test('state keeps only browser-side editing fields', () => {
    const localStorage = createLocalStorage();
    const { AppState } = loadModule(
        path.resolve('js/state.js'),
        {
            localStorage,
            window: {}
        },
        ['AppState']
    );

    assert.equal(Array.isArray(AppState.videoFiles), true);
    assert.equal('ffmpeg' in AppState, true);
    assert.equal('serverApiUrl' in AppState, false);
    assert.equal('serverReady' in AppState, false);
    assert.equal('transcriptionResult' in AppState, false);
    assert.equal('transcriptionResults' in AppState, false);
    assert.equal('bilingualSrtContent' in AppState, false);
    assert.equal('llmConfig' in AppState, false);
});

test('index.html no longer renders ASR, subtitle, or LLM controls', () => {
    const html = fs.readFileSync(path.resolve('index.html'), 'utf8');

    assert.doesNotMatch(html, /id="transcribeBtn"/);
    assert.doesNotMatch(html, /id="transcriptionPanel"/);
    assert.doesNotMatch(html, /id="serverSettingsModal"/);
    assert.doesNotMatch(html, /id="downloadSrtBtn"/);
    assert.doesNotMatch(html, /id="downloadBilingualSrtBtn"/);
    assert.doesNotMatch(html, /id="llmSettingsModal"/);
    assert.doesNotMatch(html, /语音转文字/);
    assert.doesNotMatch(html, /LLM 配置/);
});

test('repository no longer ships ASR-specific frontend modules', () => {
    assert.equal(fs.existsSync(path.resolve('js/websocket.js')), false);
    assert.equal(fs.existsSync(path.resolve('js/transcription.js')), false);
    assert.equal(fs.existsSync(path.resolve('js/llm.js')), false);
});

test('Caddyfile serves only the static app', () => {
    const caddyfile = fs.readFileSync(path.resolve('Caddyfile'), 'utf8');

    assert.match(caddyfile, /file_server/);
    assert.doesNotMatch(caddyfile, /reverse_proxy/);
    assert.doesNotMatch(caddyfile, /api\/asr/);
    assert.doesNotMatch(caddyfile, /healthz/);
    assert.doesNotMatch(caddyfile, /v1\/audio\/transcriptions/);
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

test('repository also ships a separate full frontend variant', () => {
    const readme = fs.readFileSync(path.resolve('README.md'), 'utf8');

    assert.equal(fs.existsSync(path.resolve('full/index.html')), true);
    assert.equal(fs.existsSync(path.resolve('full/js/websocket.js')), true);
    assert.equal(fs.existsSync(path.resolve('full/js/transcription.js')), true);
    assert.match(readme, /纯净版/i);
    assert.match(readme, /完整版/i);
    assert.match(readme, /full\//i);
});
