function normalizeUrls(urls) {
    if (Array.isArray(urls)) {
        return urls.map((url) => String(url || '').trim()).filter(Boolean);
    }

    const single = String(urls || '').trim();
    return single ? [single] : [];
}

async function openCache(cacheName) {
    if (!cacheName || typeof caches === 'undefined' || typeof caches.open !== 'function') {
        return null;
    }

    try {
        return await caches.open(cacheName);
    } catch (error) {
        console.warn('[assets] cache open failed:', error);
        return null;
    }
}

async function matchCachedBlob(cache, cacheKey) {
    if (!cache) return null;

    try {
        const response = await cache.match(cacheKey);
        if (!response) return null;
        return await response.blob();
    } catch (error) {
        console.warn(`[assets] cache read failed for ${cacheKey}:`, error);
        return null;
    }
}

async function storeCachedBlob(cache, cacheKey, blob) {
    if (!cache) return;

    try {
        await cache.put(cacheKey, new Response(blob));
    } catch (error) {
        console.warn(`[assets] cache write failed for ${cacheKey}:`, error);
    }
}

export async function resolveCachedAsset({
    cacheName,
    urls,
    mimeType,
    cacheKeySuffix = '',
    patcher
} = {}) {
    const candidates = normalizeUrls(urls);
    if (candidates.length === 0) {
        throw new Error('资源地址为空');
    }

    const cache = await openCache(cacheName);
    for (const url of candidates) {
        const cacheKey = `${url}${cacheKeySuffix}`;
        const cachedBlob = await matchCachedBlob(cache, cacheKey);
        if (!cachedBlob) continue;

        return {
            blob: cachedBlob,
            cacheKey,
            url,
            fromCache: true,
            objectUrl: URL.createObjectURL(cachedBlob)
        };
    }

    let lastError = null;

    for (const url of candidates) {
        const cacheKey = `${url}${cacheKeySuffix}`;

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            let blob = null;
            if (typeof patcher === 'function') {
                let body = await response.text();
                body = patcher(body, url);
                blob = new Blob([body], { type: mimeType });
            } else {
                const fetchedBlob = await response.blob();
                blob = mimeType
                    ? new Blob([fetchedBlob], { type: mimeType })
                    : fetchedBlob;
            }

            await storeCachedBlob(cache, cacheKey, blob);

            return {
                blob,
                cacheKey,
                url,
                fromCache: false,
                objectUrl: URL.createObjectURL(blob)
            };
        } catch (error) {
            lastError = new Error(`${url} -> ${error.message}`);
            console.warn(`[assets] load failed from ${url}:`, error);
        }
    }

    throw lastError || new Error('资源加载失败');
}
