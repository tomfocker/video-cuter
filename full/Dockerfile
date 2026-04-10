FROM caddy:2-alpine

WORKDIR /srv

COPY . /srv
COPY Caddyfile /etc/caddy/Caddyfile

RUN set -eux; \
    mkdir -p \
        /srv/vendor/ffmpeg/package \
        /srv/vendor/ffmpeg/core \
        /srv/vendor/wavesurfer/plugins; \
    wget -O /srv/vendor/ffmpeg/package/ffmpeg.js https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/umd/ffmpeg.js; \
    wget -O /srv/vendor/ffmpeg/package/814.ffmpeg.js https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/umd/814.ffmpeg.js; \
    wget -O /srv/vendor/ffmpeg/core/ffmpeg-core.js https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.js; \
    wget -O /srv/vendor/ffmpeg/core/ffmpeg-core.wasm https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.wasm; \
    wget -O /srv/vendor/wavesurfer/wavesurfer.esm.js https://cdn.jsdelivr.net/npm/wavesurfer.js@7/dist/wavesurfer.esm.js; \
    wget -O /srv/vendor/wavesurfer/plugins/regions.esm.js https://cdn.jsdelivr.net/npm/wavesurfer.js@7/dist/plugins/regions.esm.js; \
    wget -O /srv/vendor/wavesurfer/plugins/timeline.esm.js https://cdn.jsdelivr.net/npm/wavesurfer.js@7/dist/plugins/timeline.esm.js; \
    wget -O /srv/vendor/wavesurfer/plugins/hover.esm.js https://cdn.jsdelivr.net/npm/wavesurfer.js@7/dist/plugins/hover.esm.js

EXPOSE 8000

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
