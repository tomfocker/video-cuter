import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from './module-loader.mjs';

test('resolveAssetBaseUrls preserves configured mirrors before defaults and removes duplicates', () => {
    const { resolveAssetBaseUrls } = loadModule(
        path.resolve('js/runtime-config.js'),
        {},
        ['resolveAssetBaseUrls']
    );

    assert.deepEqual(
        resolveAssetBaseUrls(
            [
                'https://mirror.example.com/ffmpeg/',
                'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/umd'
            ],
            [
                'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/umd',
                'https://unpkg.com/@ffmpeg/ffmpeg@0.12.15/dist/umd'
            ]
        ),
        [
            'https://mirror.example.com/ffmpeg',
            'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/umd',
            'https://unpkg.com/@ffmpeg/ffmpeg@0.12.15/dist/umd'
        ]
    );
});

test('full frontend caddyfile can proxy same-origin asr requests through an env-configured upstream', () => {
    const caddyfile = fs.readFileSync(path.resolve('Caddyfile'), 'utf8');

    assert.match(caddyfile, /handle_path \/api\/asr\/\*/);
    assert.match(caddyfile, /reverse_proxy \{\$CUT_ASR_PROXY_UPSTREAM:/);
});
