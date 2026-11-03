#!/bin/sh
# Builds the theorem-ui Worker: the agent terminal's WebAssembly, the
# browser-only Theia IDE served under /theia, then the app with Nitro's
# cloudflare_module preset.
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
    # The build image is x86_64 Linux, which has a prebuilt release; anywhere
    # else cargo builds it.
    if [ "$(uname -sm)" = "Linux x86_64" ]; then
      release="wasm-bindgen-$bindgen_version-x86_64-unknown-linux-musl"
      curl -sSfL "https://github.com/wasm-bindgen/wasm-bindgen/releases/download/$bindgen_version/$release.tar.gz" |
        tar -xz -C "$HOME/.cargo/bin" --strip-components=1 "$release/wasm-bindgen"
    else
      cargo +1.96.1 install wasm-bindgen-cli --version "$bindgen_version" --locked
    fi
  fi
fi

bun install --cwd ide --frozen-lockfile
sh terminal/build.sh
bun run --cwd ide build:extensions
bun run --cwd ide/applications/browser build:prod
NITRO_PRESET=cloudflare_module bun --bun vite build
