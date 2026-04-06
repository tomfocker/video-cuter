# Faster Merge And Segment Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current two-pass merge export with a single-pass final encode, simplify the right segment panel without removing actions, and make overlapping regions snap to adjacent boundaries instead of bouncing back.

**Architecture:** Keep the current browser-side FFmpeg WASM export path, but generate one `filter_complex` graph that trims each selected segment from its source input and concatenates all normalized audio/video streams in a single output encode. Keep the right panel rendering in `js/waveform.js` and only widen the layout shell in `index.html`. Move overlap handling from a boolean reject path to a neighbor-aware snap calculation during region drag and resize events.

**Tech Stack:** Vanilla JavaScript modules, FFmpeg WASM, WaveSurfer Regions plugin, Tailwind utility classes, Node built-in test runner.

---

### Task 1: Replace merge export assertions with single-pass expectations

**Files:**
- Modify: `tests/export.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
test('merge export builds one concat filter graph from source inputs', async () => {
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

  assert.equal(ffmpeg.execCalls.length, 1);
  const command = ffmpeg.execCalls[0];
  const filterIndex = command.indexOf('-filter_complex');
  assert.notEqual(filterIndex, -1);
  assert.match(command[filterIndex + 1], /trim=start=1:end=3/);
  assert.match(command[filterIndex + 1], /atrim=start=4:end=7/);
  assert.match(command[filterIndex + 1], /concat=n=2:v=1:a=1/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/export.test.mjs`
Expected: FAIL because `js/export.js` still creates extra extraction commands and does not build `trim/atrim` into the final filter graph.

- [ ] **Step 3: Write minimal implementation**

```js
function buildMergeFilterGraph(segments, inputIndexByFile) {
  const parts = [];
  const concatInputs = [];

  segments.forEach((seg, index) => {
    const inputIndex = inputIndexByFile.get(seg.videoFile);
    const videoLabel = `v${index}`;
    const audioLabel = `a${index}`;

    parts.push(
      `[${inputIndex}:v:0]trim=start=${seg.start}:end=${seg.end},setpts=PTS-STARTPTS[${videoLabel}]`
    );
    parts.push(
      `[${inputIndex}:a:0]atrim=start=${seg.start}:end=${seg.end},asetpts=PTS-STARTPTS[${audioLabel}]`
    );
    concatInputs.push(`[${videoLabel}][${audioLabel}]`);
  });

  parts.push(`${concatInputs.join('')}concat=n=${segments.length}:v=1:a=1[v][a]`);
  return parts.join(';');
}

const mergeArgs = [
  ...inputPaths.flatMap((inputPath) => ['-i', inputPath]),
  '-filter_complex', buildMergeFilterGraph(segmentsWithFiles, inputIndexByFile),
  '-map', '[v]',
  '-map', '[a]',
  ...MERGE_PRIMARY_VIDEO_ARGS,
  ...MERGE_AUDIO_ARGS,
  '-movflags', '+faststart',
  outputName
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/export.test.mjs`
Expected: PASS with the new merge test green.

- [ ] **Step 5: Commit**

```bash
git add tests/export.test.mjs js/export.js
git commit -m "refactor: switch merge export to single-pass concat"
```

### Task 2: Implement single-pass merge export with shared inputs

**Files:**
- Modify: `js/export.js`
- Test: `tests/export.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
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

  const source = { name: 'demo.mp4' };

  await executeSmartVideoExport(
    [
      { start: 1.25, end: 3.5, videoFile: source },
      { start: 5, end: 8.75, videoFile: source }
    ],
    [],
    true
  );

  assert.equal(ffmpeg.execCalls.length, 1);
  assert.ok(ffmpeg.execCalls[0].includes('/input_0/demo.mp4'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/export.test.mjs`
Expected: FAIL because merge export still emits extraction commands or does not reuse the mounted source input in the final command.

- [ ] **Step 3: Write minimal implementation**

```js
function buildMergeInputs(segmentsWithFiles, mountFile) {
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

const mergeInputs = await buildMergeInputs(segmentsWithFiles, mountFile);
const inputIndexByFile = new Map(mergeInputs.map(({ file, inputIndex }) => [file, inputIndex]));
const inputPaths = mergeInputs.map(({ inputPath }) => inputPath).filter(Boolean);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/export.test.mjs`
Expected: PASS with one merge command using mounted source inputs.

- [ ] **Step 5: Commit**

```bash
git add js/export.js tests/export.test.mjs
git commit -m "refactor: reuse mounted inputs for merge export"
```

### Task 3: Slim the segment cards without removing actions

**Files:**
- Modify: `index.html`
- Modify: `js/waveform.js`
- Modify: `tests/waveform.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
test('segment list renders compact summary cards with all actions', () => {
  const document = createDocument();
  const appState = {
    currentVideoIndex: 0,
    videoFiles: [
      {
        name: 'first.mp4',
        file: { name: 'first.mp4' },
        objectURL: 'blob:first',
        segments: [{ id: 'seg-1', start: 3, end: 5.5 }]
      }
    ],
    allSegments: [],
    wsRegions: {
      getRegions() {
        return [{ id: 'seg-1', start: 3, end: 5.5, options: { color: 'rgba(99, 102, 241, 0.4)' } }];
      }
    }
  };

  const { renderAllSegments } = loadModule(
    path.resolve('js/waveform.js'),
    {
      AppState: appState,
      MIN_ZOOM: 0.5,
      MAX_ZOOM: 20,
      escapeHTML(value) { return value; },
      formatTime(value) { return `t:${value.toFixed(3)}`; },
      document,
      window: {},
      lucide: { createIcons() {} },
      console,
      setTimeout
    },
    ['renderAllSegments']
  );

  renderAllSegments();

  const html = document.getElementById('segmentsListContainer').innerHTML;
  assert.match(html, /clip-summary/);
  assert.match(html, /预览/);
  assert.match(html, /暂停/);
  assert.match(html, /音频/);
  assert.match(html, /视频/);
  assert.match(html, /删除/);
  assert.doesNotMatch(html, /导出时长/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/waveform.test.mjs`
Expected: FAIL because the current card still renders the older three-box metadata layout and does not include the compact summary hook.

- [ ] **Step 3: Write minimal implementation**

```js
function buildSegmentCard(seg, index) {
  const summary = `${formatTime(seg.start)} → ${formatTime(seg.end)} ・ 时长 ${formatTime(seg.end - seg.start)}`;

  return `
    <article class="segment-card rounded-2xl ...">
      <div class="clip-summary text-xs text-gray-400">${summary}</div>
      <div class="actions-row ...">
        <button ...>预览</button>
        <button ...>暂停</button>
        <button ...>音频</button>
        <button ...>视频</button>
        <button ...>删除</button>
      </div>
    </article>
  `;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/waveform.test.mjs`
Expected: PASS with the compact summary markup and all actions still present.

- [ ] **Step 5: Commit**

```bash
git add index.html js/waveform.js tests/waveform.test.mjs
git commit -m "feat: simplify segment panel layout"
```

### Task 4: Make the right column wider on desktop layouts

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Write the failing test**

```js
// Manual DOM snapshot check: desktop layout should no longer use the current 2/1 split.
assert.match(
  htmlSource,
  /grid-cols-1 lg:grid-cols-\[minmax\(0,1\.05fr\)_minmax\(360px,0\.95fr\)\]/
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rg -n "lg:grid-cols-\\[minmax\\(0,1\\.05fr\\)_minmax\\(360px,0\\.95fr\\)\\]" index.html`
Expected: no matches because the current workspace still uses the old `lg:grid-cols-3` shell.

- [ ] **Step 3: Write minimal implementation**

```html
<div id="workspace" class="hidden flex flex-col gap-6 animate-in fade-in duration-500">
  <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)] gap-6">
    <div class="min-w-0 flex flex-col gap-4">
    ...
    <div class="flex flex-col gap-6 min-w-0">
```

- [ ] **Step 4: Run test to verify it passes**

Run: `rg -n "lg:grid-cols-\\[minmax\\(0,1\\.05fr\\)_minmax\\(360px,0\\.95fr\\)\\]" index.html`
Expected: one match in `index.html`.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "style: widen desktop segment column"
```

### Task 5: Add snap helpers for region overlap handling

**Files:**
- Modify: `tests/waveform.test.mjs`
- Modify: `js/waveform.js`

- [ ] **Step 1: Write the failing test**

```js
test('snapRegionBounds moves a resized left edge to the previous segment end', () => {
  const { snapRegionBounds } = loadModule(
    path.resolve('js/waveform.js'),
    {
      AppState: {},
      MIN_ZOOM: 0.5,
      MAX_ZOOM: 20,
      escapeHTML(value) { return value; },
      formatTime(value) { return String(value); },
      document: { getElementById() { return { classList: { add() {}, remove() {} } }; } },
      window: {},
      lucide: { createIcons() {} },
      console,
      setTimeout
    },
    ['snapRegionBounds']
  );

  const result = snapRegionBounds(
    { start: 4, end: 7 },
    [
      { id: 'prev', start: 1, end: 5 },
      { id: 'next', start: 8, end: 10 }
    ],
    { mode: 'resize-start', minDuration: 0.1 }
  );

  assert.equal(result.start, 5);
  assert.equal(result.end, 7);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/waveform.test.mjs`
Expected: FAIL because `snapRegionBounds` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```js
export function snapRegionBounds(candidate, neighbors, context) {
  const previous = neighbors.find((seg) => seg.end <= candidate.end && seg.start < candidate.start);
  const next = neighbors.find((seg) => seg.start >= candidate.start && seg.end > candidate.end);

  if (context.mode === 'resize-start' && previous && candidate.start < previous.end) {
    return { start: previous.end, end: candidate.end };
  }

  if (context.mode === 'resize-end' && next && candidate.end > next.start) {
    return { start: candidate.start, end: next.start };
  }

  return candidate;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/waveform.test.mjs`
Expected: PASS for the left-edge snap case.

- [ ] **Step 5: Commit**

```bash
git add js/waveform.js tests/waveform.test.mjs
git commit -m "feat: add region snap helpers"
```

### Task 6: Apply snap behavior to resize and move interactions

**Files:**
- Modify: `tests/waveform.test.mjs`
- Modify: `js/waveform.js`

- [ ] **Step 1: Write the failing test**

```js
test('snapRegionBounds preserves duration when moving into the next segment', () => {
  const { snapRegionBounds } = loadModule(
    path.resolve('js/waveform.js'),
    {
      AppState: {},
      MIN_ZOOM: 0.5,
      MAX_ZOOM: 20,
      escapeHTML(value) { return value; },
      formatTime(value) { return String(value); },
      document: { getElementById() { return { classList: { add() {}, remove() {} } }; } },
      window: {},
      lucide: { createIcons() {} },
      console,
      setTimeout
    },
    ['snapRegionBounds']
  );

  const result = snapRegionBounds(
    { start: 4.8, end: 6.8 },
    [
      { id: 'prev', start: 1, end: 4 },
      { id: 'next', start: 6, end: 10 }
    ],
    { mode: 'move', minDuration: 0.1, originalDuration: 2 }
  );

  assert.equal(result.end, 6);
  assert.equal(result.start, 4);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/waveform.test.mjs`
Expected: FAIL because move mode currently rebounds or overlaps instead of snapping to the nearest legal slot.

- [ ] **Step 3: Write minimal implementation**

```js
if (context.mode === 'move') {
  const duration = context.originalDuration;

  if (previous && candidate.start < previous.end) {
    return { start: previous.end, end: previous.end + duration };
  }

  if (next && candidate.end > next.start) {
    return { start: next.start - duration, end: next.start };
  }
}
```

Apply it inside the region listeners:

```js
AppState.wsRegions.on('region-update-start', (region) => {
  region.dragStartState = { start: region.start, end: region.end };
});

AppState.wsRegions.on('region-updating', (region) => {
  const mode = inferRegionUpdateMode(region);
  const snapped = snapRegionBounds(
    { start: region.start, end: region.end },
    getSiblingSegments(region.id),
    { mode, minDuration: 0.1, originalDuration: region.dragStartState.end - region.dragStartState.start }
  );
  region.setOptions(snapped);
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/waveform.test.mjs`
Expected: PASS for both resize and move snapping cases.

- [ ] **Step 5: Commit**

```bash
git add js/waveform.js tests/waveform.test.mjs
git commit -m "feat: snap overlapping region edits"
```

### Task 7: Run regression verification for export and panel changes

**Files:**
- Modify: `tests/export.test.mjs`
- Modify: `tests/waveform.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
test('merge export still downloads one output file after a successful run', async () => {
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
      downloadBlob(blob, filename) { downloads.push({ blob, filename }); },
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

  await executeSmartVideoExport(
    [{ start: 0, end: 2, videoFile: { name: 'demo.mp4' } }],
    [],
    true
  );

  assert.equal(downloads.length, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/*.test.mjs`
Expected: FAIL if any merge refactor regressed the download behavior or panel structure.

- [ ] **Step 3: Write minimal implementation**

```js
// Keep the existing successful download path after AppState.ffmpeg.readFile(outputName)
downloadBlob(
  new Blob([data.buffer], { type: 'application/octet-stream' }),
  `merged_${Math.floor(Date.now() / 1000)}.${outputExt}`
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/*.test.mjs`
Expected: PASS with all export and waveform tests green.

- [ ] **Step 5: Commit**

```bash
git add tests/export.test.mjs tests/waveform.test.mjs js/export.js js/waveform.js index.html
git commit -m "test: verify merge export and segment panel regressions"
```
