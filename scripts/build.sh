#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if [ "${WORKERS_CI:-}" = 1 ]; then
  exec sh scripts/build-cloudflare.sh
fi
sh terminal/build.sh
# Pinned, verified browser Q8 code assets (the weights are served, not built).
bun scripts/semantic-q8/stage.mjs --code-only
bun --bun vite build
bun scripts/semantic-q8/check-output.mjs .output/public
