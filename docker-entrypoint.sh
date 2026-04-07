#!/bin/sh
set -eu

server_api_url="$(printf '%s' "${CUT_SERVER_API_URL}" | sed 's/\\/\\\\/g; s/"/\\"/g')"

cat >/srv/config.js <<EOF
window.__CUT_CONFIG__ = {
  serverApiUrl: "${server_api_url}"
};
EOF

exec "$@"
