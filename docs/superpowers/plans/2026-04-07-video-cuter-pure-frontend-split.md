# Video Cuter Pure Frontend Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strip `video-cuter` down to a pure browser-side video cutting tool with no ASR, subtitle, or LLM coupling.

**Architecture:** Keep the existing single-page FFmpeg-based editor, waveform selection, and export pipeline. Remove every UI surface, state field, module import, test, and deployment path that assumes a speech-recognition backend or text-derived editing workflow so this repo cleanly represents a standalone frontend product.

**Tech Stack:** Static HTML, modular browser JavaScript, Tailwind via CDN, Node built-in test runner, optional static hosting via GitHub Pages

---

### Task 1: Lock Pure Frontend Boundaries in Tests

**Files:**
- Modify: `tests/transcription-http.test.mjs`
- Test: `tests/transcription-http.test.mjs`

- [ ] **Step 1: Replace backend-coupled assertions with pure-frontend expectations**

```javascript
test('state keeps only frontend editing fields', () => {
    const { AppState } = loadModule(path.resolve('js/state.js'), { localStorage, window: {} }, ['AppState']);
    assert.equal('serverApiUrl' in AppState, false);
    assert.equal('transcriptionResult' in AppState, false);
    assert.equal('llmConfig' in AppState, false);
});
```

- [ ] **Step 2: Run test to verify it fails against current backend-coupled code**

Run: `node --test tests/transcription-http.test.mjs`
Expected: FAIL because `AppState` still exposes ASR-related fields and the page still contains ASR controls.

- [ ] **Step 3: Add pure-frontend repository assertions**

```javascript
test('index.html no longer renders ASR or subtitle controls', () => {
    const html = fs.readFileSync(path.resolve('index.html'), 'utf8');
    assert.doesNotMatch(html, /transcribeBtn/);
    assert.doesNotMatch(html, /serverSettingsModal/);
    assert.doesNotMatch(html, /downloadSrtBtn/);
    assert.doesNotMatch(html, /LLM 配置/);
});
```

- [ ] **Step 4: Run test to verify it fails for the expected UI remnants**

Run: `node --test tests/transcription-http.test.mjs`
Expected: FAIL because the current page still includes ASR and subtitle UI.

- [ ] **Step 5: Commit the failing test baseline**

```bash
git add tests/transcription-http.test.mjs
git commit -m "test: define pure frontend repository boundaries"
```

### Task 2: Remove ASR, Subtitle, and LLM Features from the Frontend

**Files:**
- Modify: `index.html`
- Modify: `js/main.js`
- Modify: `js/state.js`
- Modify: `js/video.js`
- Modify: `js/waveform.js`
- Modify: `README.md`
- Delete: `js/transcription.js`
- Delete: `js/websocket.js`
- Delete: `js/llm.js`

- [ ] **Step 1: Remove ASR and subtitle panels from the page**

```html
<!-- Keep waveform, segment list, and export controls only -->
<div class="mt-4 flex items-center justify-between gap-4">
  <div class="text-[10px] text-gray-500">拖拽波形创建片段，随后在右侧导出。</div>
</div>
```

- [ ] **Step 2: Remove ASR-related imports and event wiring from `js/main.js`**

```javascript
import { AppState } from './state.js';
import { initDB } from './database.js';
import { setSwitchToVideoCallback, resetZoom } from './waveform.js';
import { switchToVideo, renderVideoList, handleFileSelect, clearAllSegments, resetWorkspace } from './video.js';
import { processAudioExport, processMergeAudioExport, executeSmartVideoExport } from './export.js';
```

- [ ] **Step 3: Shrink `AppState` to browser-only editing state**

```javascript
export const AppState = {
    lastProgressLog: 0,
    videoFiles: [],
    currentVideoIndex: -1,
    wavesurfer: null,
    wsRegions: null,
    allSegments: [],
    ffmpeg: null,
    highlightRegion: null,
    currentZoom: 1,
    deletionMap: new Set(),
    savedWorkspaceData: null
};
```

- [ ] **Step 4: Remove transcription-aware behavior from waveform/video modules**

```javascript
function clearVideoRelatedState() {
    AppState.highlightRegion = null;
}
```

- [ ] **Step 5: Delete modules that belong in the future integrated repo**

```bash
rm js/transcription.js js/websocket.js js/llm.js
```

- [ ] **Step 6: Run targeted tests to verify the pure-frontend implementation**

Run: `node --test tests/transcription-http.test.mjs tests/export.test.mjs tests/waveform.test.mjs`
Expected: PASS with no references to ASR, subtitles, or LLM features.

- [ ] **Step 7: Commit the frontend split**

```bash
git add index.html js/main.js js/state.js js/video.js js/waveform.js README.md tests/transcription-http.test.mjs
git rm js/transcription.js js/websocket.js js/llm.js
git commit -m "refactor: make video-cuter a pure frontend editor"
```

### Task 3: Simplify Static Deployment for the Pure Frontend Repo

**Files:**
- Modify: `Caddyfile`
- Modify: `Dockerfile`
- Modify: `docker-entrypoint.sh`
- Delete: `config.js`
- Test: `tests/transcription-http.test.mjs`

- [ ] **Step 1: Replace proxy-specific assertions with static-hosting expectations**

```javascript
test('Caddyfile serves the static app without ASR proxy routes', () => {
    const caddyfile = fs.readFileSync(path.resolve('Caddyfile'), 'utf8');
    assert.doesNotMatch(caddyfile, /api\/asr/);
    assert.doesNotMatch(caddyfile, /healthz/);
    assert.match(caddyfile, /file_server/);
});
```

- [ ] **Step 2: Run test to verify it fails before simplifying the container config**

Run: `node --test tests/transcription-http.test.mjs`
Expected: FAIL because the current Caddyfile still proxies backend endpoints.

- [ ] **Step 3: Simplify the static hosting files**

```caddyfile
:8000 {
  encode gzip
  root * /srv
  file_server
}
```

```dockerfile
FROM caddy:2-alpine
WORKDIR /srv
COPY . /srv
COPY Caddyfile /etc/caddy/Caddyfile
EXPOSE 8000
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
```

- [ ] **Step 4: Remove no-longer-needed runtime config glue**

```bash
git rm config.js docker-entrypoint.sh
```

- [ ] **Step 5: Run tests to verify the static deployment shape**

Run: `node --test tests/transcription-http.test.mjs`
Expected: PASS with only static-hosting assertions remaining.

- [ ] **Step 6: Commit the deployment cleanup**

```bash
git add Caddyfile Dockerfile tests/transcription-http.test.mjs
git rm config.js docker-entrypoint.sh
git commit -m "chore: simplify static deployment for video-cuter"
```

### Task 4: Refresh Documentation and Verify the Repository End-to-End

**Files:**
- Modify: `README.md`
- Test: `tests/*.test.mjs`

- [ ] **Step 1: Rewrite README around the pure-frontend product**

```markdown
## Online Demo

https://tomfocker.github.io/video-cuter/

## Scope

- Browser-side video trimming
- Waveform region editing
- Local FFmpeg export

Not included in this repo:

- Speech recognition
- Subtitle generation
- Backend service integration
```

- [ ] **Step 2: Add pointers to the future backend and integrated repos**

```markdown
- `funasr-server`: speech recognition backend
- `video-cuter-suite`: full integrated experience
```

- [ ] **Step 3: Run the full repository test suite**

Run: `node --test tests/*.test.mjs`
Expected: PASS with 0 failures.

- [ ] **Step 4: Rebuild the static image for a smoke check**

Run: `docker build -t videocuter-web:pure .`
Expected: Build succeeds with no backend-specific runtime variables.

- [ ] **Step 5: Commit the documentation refresh**

```bash
git add README.md
git commit -m "docs: document video-cuter as a pure frontend tool"
```
