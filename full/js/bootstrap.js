import { getRuntimeAssetConfig } from './runtime-config.js';

async function importWaveSurferBundle() {
    const { wavesurferBaseUrls } = getRuntimeAssetConfig();
    let lastError = null;

    for (const baseUrl of wavesurferBaseUrls) {
        try {
            const [waveSurferModule, regionsModule, timelineModule, hoverModule] = await Promise.all([
                import(`${baseUrl}/wavesurfer.esm.js`),
                import(`${baseUrl}/plugins/regions.esm.js`),
                import(`${baseUrl}/plugins/timeline.esm.js`),
                import(`${baseUrl}/plugins/hover.esm.js`)
            ]);

            window.WaveSurfer = waveSurferModule.default;
            window.RegionsPlugin = regionsModule.default;
            window.TimelinePlugin = timelineModule.default;
            window.HoverPlugin = hoverModule.default;
            return;
        } catch (error) {
            lastError = error;
            console.warn(`[assets] WaveSurfer load failed from ${baseUrl}:`, error);
        }
    }

    throw lastError || new Error('WaveSurfer 资源加载失败');
}

async function bootstrap() {
    await importWaveSurferBundle();
    await import('./main.js');
    console.log('Main logic loaded');
}

bootstrap().catch((error) => {
    console.error('Failed to load frontend bootstrap:', error);
    if (window.location.protocol === 'file:') {
        alert('建议使用本地服务器（如 python -m http.server）运行，以支持 JS 模块加载。');
        return;
    }

    alert(`前端资源加载失败：${error.message}`);
});
