#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if [ "${WORKERS_CI:-}" = 1 ]; then
  exec sh scripts/build-cloudflare.sh
fi
sh terminal/build.sh
exec bun --bun vite build
