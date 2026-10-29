#!/bin/sh
# Builds the theorem-ui Worker: the agent terminal's WebAssembly, the
# browser-only Theia IDE served under /theia, then the app with Nitro's
# cloudflare_module preset. Workers Builds runs this on an image with Bun but
# no Rust and without the IDE's own dependencies, so those are fetched when
# missing; a machine that already has them goes straight to the build.
set -eu
cd "$(dirname "$0")/.."

if ! command -v cargo >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs |
    sh -s -- -y --profile minimal --target wasm32-unknown-unknown
  . "$HOME/.cargo/env"
fi

# terminal/build.sh needs the wasm-bindgen CLI at the crate's pinned version.
# The prebuilt release is for x86_64 Linux, which is what Workers Builds runs.
if ! command -v wasm-bindgen >/dev/null 2>&1; then
  version=$(sed -n 's/^wasm-bindgen = "=\([^"]*\)".*/\1/p' terminal/Cargo.toml)
  release="wasm-bindgen-$version-x86_64-unknown-linux-musl"
  curl -sSfL "https://github.com/wasm-bindgen/wasm-bindgen/releases/download/$version/$release.tar.gz" |
    tar -xz -C "$HOME/.cargo/bin" --strip-components=1 "$release/wasm-bindgen"
fi

# The IDE is a Bun workspace of its own, with a hoisted node_modules.
[ -d ide/node_modules ] || bun install --cwd ide --frozen-lockfile

sh terminal/build.sh
bun run --cwd ide build:extensions
bun run --cwd ide/applications/browser build:prod
NITRO_PRESET=cloudflare_module bun --bun vite build
