export const AppState = {
    lastProgressLog: 0,
    pendingSelections: [],
    excludeSelections: [],
    transcriptionResult: null,
    currentSelectionRange: null,
    selectionMode: 'keep',
    bilingualSrtContent: null,
    pendingPreviewRegion: null,
    isPreviewMode: false,
    isResetState: false,
    videoFiles: [],
    currentVideoIndex: -1,
    wavesurfer: null,
    wsRegions: null,
    allSegments: [],
    ffmpeg: null,
    transcriptionResults: {},
    highlightRegion: null,
    currentZoom: 1,
    deletionMap: new Set(),
    savedWorkspaceData: null,
    
    serverApiUrl: localStorage.getItem('serverApiUrl') || 'ws://127.0.0.1:6006',
    llmConfig: {
        apiUrl: localStorage.getItem('llmApiUrl') || 'https://api.openai.com/v1',
        apiKey: localStorage.getItem('llmApiKey') || '',
        model: localStorage.getItem('llmModel') || 'gpt-4o-mini',
        targetLang: localStorage.getItem('llmTargetLang') || '中文'
    }
};

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 20;
export const DB_NAME = 'VideoEditorDB';
export const DB_VERSION = 1;

export let db = null;
export const setDb = (newDb) => { db = newDb; };

export let ws = null;
export const setWs = (newWs) => { ws = newWs; };
