# Cut ASR Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect `cut` to the working FunASR HTTP service, restore the missing transcription UI, improve subtitle and text-selection behavior, and keep export workflows stable.

**Architecture:** Keep `cut` as a static browser app. Replace the old WebSocket transcription flow with HTTP upload to the existing ASR service, normalize the backend payload into a stable frontend shape, and update the UI plus downstream selection/download logic to use subtitle-oriented chunks rather than one-character token assumptions.

**Tech Stack:** Vanilla JavaScript modules, FFmpeg WASM, Tailwind utilities, Node built-in test runner, FastAPI ASR service over HTTP.

---

### Task 1: Lock HTML and utility expectations with failing tests

**Files:**
- Create: `tests/transcription-http.test.mjs`
- Modify: `tests/module-loader.mjs`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run `node --test tests/transcription-http.test.mjs` and verify it fails for missing helpers / controls**
- [ ] **Step 3: Add minimal helper loading support if a test needs extra exported functions**
- [ ] **Step 4: Re-run the single test and confirm the failure now points at missing implementation**

### Task 2: Implement HTTP service normalization and health check

**Files:**
- Modify: `js/websocket.js`
- Modify: `js/state.js`
- Test: `tests/transcription-http.test.mjs`

- [ ] **Step 1: Add tests for**
  - normalizing backend `segments/subtitle_segments/srt`
  - preferring `/healthz` for connection checks
  - default service URL being `http://127.0.0.1:8000`
- [ ] **Step 2: Run the focused tests and watch them fail**
- [ ] **Step 3: Replace WebSocket-specific connection logic with HTTP health checks and upload helpers**
- [ ] **Step 4: Re-run the focused tests until they pass**

### Task 3: Fix subtitle generation and download behavior

**Files:**
- Modify: `js/utils.js`
- Test: `tests/transcription-http.test.mjs`

- [ ] **Step 1: Add tests for backend `srt` passthrough and local fallback generation from normalized chunks**
- [ ] **Step 2: Run the focused tests and confirm failure**
- [ ] **Step 3: Implement `srt` passthrough plus fallback generation**
- [ ] **Step 4: Re-run the focused tests and confirm pass**

### Task 4: Refactor transcript rendering and selection merging

**Files:**
- Modify: `js/transcription.js`
- Modify: `js/llm.js`
- Test: `tests/transcription-http.test.mjs`

- [ ] **Step 1: Add tests for merging adjacent selected transcript ranges into continuous regions**
- [ ] **Step 2: Run the focused tests and confirm failure**
- [ ] **Step 3: Refactor rendering to use normalized display chunks and update LLM helpers to read the normalized structure**
- [ ] **Step 4: Re-run the focused tests and confirm pass**

### Task 5: Restore missing Web UI controls and remove fake gating

**Files:**
- Modify: `index.html`
- Modify: `js/main.js`
- Test: `tests/transcription-http.test.mjs`

- [ ] **Step 1: Add tests that assert the page contains the required settings, status, mode, and download controls**
- [ ] **Step 2: Run the focused tests and confirm failure**
- [ ] **Step 3: Add the missing DOM nodes and remove unconditional `.pro-feature` click blocking**
- [ ] **Step 4: Re-run the focused tests and confirm pass**

### Task 6: Verify end-to-end behavior and document usage

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Run `node --test tests/*.test.mjs`**
- [ ] **Step 2: Run a live health check against `http://127.0.0.1:8000/healthz`**
- [ ] **Step 3: Run a live transcription request against the local ASR service**
- [ ] **Step 4: Update README with deployment and integration instructions**
- [ ] **Step 5: Re-run the full test suite and manual verification commands before reporting completion**
