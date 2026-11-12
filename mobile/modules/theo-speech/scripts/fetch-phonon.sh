#!/bin/sh
# SOURCING: the sha-pinned fetch pattern of modules/theorem-session/scripts/fetch-ghosttykit.sh; the ptts v0.7.0 release assets and their SHA256SUMS
#
# Puts the three pieces modules/theo-speech/ios/TheoSpeech.podspec names into
# ios/vendor: the compiled PhononCore, the ptts Swift sources, and the Core ML
# Models folder. The first two come from the release by sha; the Models folder
# carries the owner's voice, so it is exported, not downloaded: run this on a
# machine that has the export, or point PHONON_COREML_DIR at one.
set -eu
cd "$(dirname "$0")/.."

VENDOR=ios/vendor
VERSION=0.7.0
BASE="https://github.com/gradium-ai/xn-ptts/releases/download/v$VERSION"
CORE_SHA=dfc50de08b15f32e2b18157ce83eff622a01ea2353d902593c1f823514fd8579
SWIFT_SHA=1c3c2946a8e8a0a4b7268dba89cbc04ea2edd5590870e57512b13b39a96ffc65

mkdir -p "$VENDOR"

if [ ! -d "$VENDOR/PhononCore.xcframework" ]; then
  curl -fsSL "$BASE/PhononCore.xcframework.zip" -o /tmp/PhononCore.xcframework.zip
  echo "$CORE_SHA  /tmp/PhononCore.xcframework.zip" | shasum -a 256 -c -
  unzip -q -o /tmp/PhononCore.xcframework.zip -d "$VENDOR"
fi

if [ ! -d "$VENDOR/ptts/Sources" ]; then
  curl -fsSL "$BASE/ptts-swift-$VERSION.zip" -o /tmp/ptts-swift.zip
  echo "$SWIFT_SHA  /tmp/ptts-swift.zip" | shasum -a 256 -c -
  rm -rf /tmp/ptts-swift-pkg
  unzip -q -o /tmp/ptts-swift.zip -d /tmp/ptts-swift-pkg
  mkdir -p "$VENDOR/ptts"
  cp -R "/tmp/ptts-swift-pkg/ptts-swift-$VERSION/Sources" "$VENDOR/ptts/Sources"
fi

if [ ! -d "$VENDOR/Models" ]; then
  SRC="${PHONON_COREML_DIR:-$HOME/Downloads/phonon-coreml-theo}"
  if [ -d "$SRC" ]; then
    cp -R "$SRC" "$VENDOR/Models"
  else
    echo "theo-speech: no Core ML Models folder at $SRC." >&2
    echo "Export one carrying the owner's voice, from an xn-ptts v$VERSION checkout:" >&2
    echo "  cargo run --release -p ptts --example export_coreml --features hub -- <dir> --voices <dir holding theo.safetensors> --condition duration_delta=-0.05" >&2
    exit 1
  fi
fi

echo "theo-speech: vendor ready."
