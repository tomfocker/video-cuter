import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from './module-loader.mjs';

function createCachesDouble() {
    const stores = new Map();

    return {
        async open(cacheName) {
            if (!stores.has(cacheName)) {
                stores.set(cacheName, new Map());
            }
            const cache = stores.get(cacheName);
            return {
                async match(key) {
                    return cache.get(key) || undefined;
                },
                async put(key, value) {
                    cache.set(key, value);
                }
            };
        }
    };
}

class SimpleBlob {
    constructor(parts, options = {}) {
        this.parts = parts;
        this.type = options.type || '';
        this.size = parts.reduce((total, part) => {
            if (typeof part === 'string') return total + Buffer.byteLength(part);
            if (part?.byteLength !== undefined) return total + part.byteLength;
            return total;
        }, 0);
    }

    async text() {
        return this.parts.map((part) => {
            if (typeof part === 'string') return part;
            return Buffer.from(part).toString('utf8');
        }).join('');
    }
}

class SimpleResponse {
    constructor(body) {
        this._body = body;
    }

    async blob() {
        return this._body;
    }
}

test('resolveCachedAsset reuses cache hits without refetching', async () => {
    const caches = createCachesDouble();
    const fetchCalls = [];
    const urlCalls = [];
    const blob = new SimpleBlob(['cached-asset'], { type: 'text/plain' });
    const cache = await caches.open('ffmpeg-assets');
    await cache.put('https://cdn.example.com/file.js', new SimpleResponse(blob));

    const { resolveCachedAsset } = loadModule(
        path.resolve('js/asset-cache.js'),
        {
            caches,
            fetch: async (url) => {
                fetchCalls.push(url);
                throw new Error('fetch should not be called');
            },
            Blob: SimpleBlob,
            Response: SimpleResponse,
            URL: {
                createObjectURL(value) {
                    urlCalls.push(value);
                    return 'blob:cached';
                }
            },
            console
        },
        ['resolveCachedAsset']
    );

    const result = await resolveCachedAsset({
        cacheName: 'ffmpeg-assets',
        urls: ['https://cdn.example.com/file.js'],
        mimeType: 'text/plain'
    });

    assert.equal(result.objectUrl, 'blob:cached');
    assert.equal(result.fromCache, true);
    assert.deepEqual(fetchCalls, []);
    assert.equal(urlCalls.length, 1);
});

test('resolveCachedAsset fetches, caches, and falls back across urls', async () => {
    const caches = createCachesDouble();
    const fetchCalls = [];
    const { resolveCachedAsset } = loadModule(
        path.resolve('js/asset-cache.js'),
        {
            caches,
            fetch: async (url) => {
                fetchCalls.push(url);
                if (url.includes('primary')) {
                    throw new Error('network down');
                }
                return {
                    ok: true,
                    body: null,
                    async blob() {
                        return new SimpleBlob(['fetched-asset'], { type: 'text/plain' });
                    }
                };
            },
            Blob: SimpleBlob,
            Response: SimpleResponse,
            URL: {
                createObjectURL() {
                    return 'blob:fetched';
                }
            },
            console
        },
        ['resolveCachedAsset']
    );

    const result = await resolveCachedAsset({
        cacheName: 'ffmpeg-assets',
        urls: [
            'https://primary.example.com/file.js',
            'https://backup.example.com/file.js'
        ],
        mimeType: 'text/plain'
    });

    assert.equal(result.objectUrl, 'blob:fetched');
    assert.equal(result.fromCache, false);
    assert.deepEqual(fetchCalls, [
        'https://primary.example.com/file.js',
        'https://backup.example.com/file.js'
    ]);

    const cache = await caches.open('ffmpeg-assets');
    const cached = await cache.match('https://backup.example.com/file.js');
    assert.ok(cached);
});
