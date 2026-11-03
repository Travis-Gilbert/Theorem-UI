#!/bin/sh
set -eu
cd "$(dirname "$0")/.."

# Workers Builds starts from a clean checkout. Provision the Rust tools only
# there; local developers keep their existing toolchain and credentials.
if [ "${WORKERS_CI:-}" = 1 ]; then
  if ! command -v rustup >/dev/null 2>&1; then
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs -o /tmp/theorem-rustup-init.sh
    sh /tmp/theorem-rustup-init.sh -y --profile minimal --default-toolchain 1.96.1
    . "$HOME/.cargo/env"
  fi
  rustup toolchain install 1.96.1 --profile minimal --target wasm32-unknown-unknown
  bindgen_version=$(bun -e 'const manifest = Bun.TOML.parse(await Bun.file("terminal/Cargo.toml").text()); console.log(manifest.dependencies["wasm-bindgen"].replace(/^=/, ""))')
  if [ "$(wasm-bindgen --version 2>/dev/null || true)" != "wasm-bindgen $bindgen_version" ]; then
    cargo +1.96.1 install wasm-bindgen-cli --version "$bindgen_version" --locked
  fi
fi

bun install --cwd ide --frozen-lockfile
sh terminal/build.sh
bun run --cwd ide build:extensions
bun run --cwd ide/applications/browser build:prod
NITRO_PRESET=cloudflare_module bun --bun vite build
