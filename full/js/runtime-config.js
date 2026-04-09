const DEFAULT_FFMPEG_PACKAGE_BASE_URLS = [
    'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/umd',
    'https://unpkg.com/@ffmpeg/ffmpeg@0.12.15/dist/umd'
];

const DEFAULT_FFMPEG_CORE_BASE_URLS = [
    'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd',
    'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd'
];

const DEFAULT_WAVESURFER_BASE_URLS = [
    'https://cdn.jsdelivr.net/npm/wavesurfer.js@7/dist',
    'https://unpkg.com/wavesurfer.js@7/dist'
];

function normalizeBaseUrl(url) {
    return String(url || '').trim().replace(/\/+$/, '');
}

export function resolveAssetBaseUrls(configured, defaults) {
    const configuredList = Array.isArray(configured) ? configured : [];
    const merged = [...configuredList, ...defaults];
    const unique = [];

    for (const url of merged) {
        const normalized = normalizeBaseUrl(url);
        if (!normalized || unique.includes(normalized)) continue;
        unique.push(normalized);
    }

    return unique;
}

export function buildAssetUrlCandidates(baseUrls, relativePath) {
    const cleanPath = String(relativePath || '').replace(/^\/+/, '');
    return baseUrls.map((baseUrl) => `${normalizeBaseUrl(baseUrl)}/${cleanPath}`);
}

export function getRuntimeAssetConfig() {
    const config = window.__CUT_CONFIG__ || {};

    return {
        ffmpegPackageBaseUrls: resolveAssetBaseUrls(
            config.ffmpegPackageBaseUrls,
            DEFAULT_FFMPEG_PACKAGE_BASE_URLS
        ),
        ffmpegCoreBaseUrls: resolveAssetBaseUrls(
            config.ffmpegCoreBaseUrls,
            DEFAULT_FFMPEG_CORE_BASE_URLS
        ),
        wavesurferBaseUrls: resolveAssetBaseUrls(
            config.wavesurferBaseUrls,
            DEFAULT_WAVESURFER_BASE_URLS
        )
    };
}
