#!/bin/sh
# Builds the agent terminal's WebAssembly and its JS bindings into
# src/terminal-wasm (gitignored). The wasm-bindgen CLI must match the
# wasm-bindgen crate version pinned in Cargo.toml.
set -eu
cd "$(dirname "$0")"
cargo build --release --target wasm32-unknown-unknown
target=$(cargo metadata --format-version 1 --no-deps | sed -n 's/.*"target_directory":"\([^"]*\)".*/\1/p')
wasm-bindgen --target web --out-dir ../src/terminal-wasm \
  "$target/wasm32-unknown-unknown/release/theorem_terminal.wasm"
