function normalizeServerApiUrl(url) {
    return String(url || '').trim().replace(/\/+$/, '');
}

function resolveCurrentOrigin() {
    const origin = window?.location?.origin;
    return normalizeServerApiUrl(origin);
}

function readStoredServerApiUrl() {
    if (typeof localStorage === 'undefined') return '';
    return normalizeServerApiUrl(localStorage.getItem('serverApiUrl'));
}

function persistServerApiUrl(url) {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('serverApiUrl', url);
}

function migrateLegacyServerApiUrl(url, currentOrigin) {
    const normalized = normalizeServerApiUrl(url);
    if (!normalized) return '';

    if (normalized === '/api/asr') {
        return currentOrigin || normalized;
    }

    if (currentOrigin && normalized === `${currentOrigin}/api/asr`) {
        return currentOrigin;
    }

    return normalized;
}

function resolveDefaultServerApiUrl() {
    const hasWindow = typeof window !== 'undefined';
    const currentOrigin = hasWindow ? resolveCurrentOrigin() : '';
    const configured = hasWindow ? window.__CUT_CONFIG__?.serverApiUrl : undefined;
    if (configured !== undefined && configured !== null && String(configured).trim()) {
        return migrateLegacyServerApiUrl(configured, currentOrigin);
    }

    const saved = readStoredServerApiUrl();
    if (saved) {
        const migrated = migrateLegacyServerApiUrl(saved, currentOrigin);
        if (migrated && migrated !== saved) {
            persistServerApiUrl(migrated);
        }
        return migrated;
    }

    return currentOrigin || '/api/asr';
}

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
    serverReady: false,
    serverInfo: null,
    
    serverApiUrl: resolveDefaultServerApiUrl(),
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
