window.__CUT_CONFIG__ = {
    serverApiUrl: window.location?.origin || '/api/asr',
    ffmpegPackageBaseUrls: ['/vendor/ffmpeg/package'],
    ffmpegCoreBaseUrls: ['/vendor/ffmpeg/core'],
    wavesurferBaseUrls: ['/vendor/wavesurfer'],
    ...(window.__CUT_CONFIG__ || {})
};
