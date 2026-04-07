export const AppState = {
    lastProgressLog: 0,
    videoFiles: [],
    currentVideoIndex: -1,
    wavesurfer: null,
    wsRegions: null,
    allSegments: [],
    ffmpeg: null,
    currentZoom: 1,
    deletionMap: new Set(),
    savedWorkspaceData: null
};

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 20;
export const DB_NAME = 'VideoEditorDB';
export const DB_VERSION = 1;

export let db = null;
export const setDb = (newDb) => { db = newDb; };

export let ws = null;
export const setWs = (newWs) => { ws = newWs; };
