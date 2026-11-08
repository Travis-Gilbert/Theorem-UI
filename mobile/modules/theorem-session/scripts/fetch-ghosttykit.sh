#!/usr/bin/env bash
# SOURCING: Remux scripts/fetch_ghosttykit.sh at the vendored revision (same release tag and checksum)
#
# Installs the prebuilt ReleaseFast GhosttyKit.xcframework the vendored Remux
# sources were built against, after checking the archive's SHA-256. Runs on
# macOS (EAS builders, Xcode machines); --verify only checks what is installed.
set -euo pipefail

release_tag="ghosttykit-20261104"
asset_sha256="5f4e70713b9a55e07bba40754bd72e4b453467cacc20814a9d915c65934db957"
asset_url="https://github.com/h3nock/remux-ghostty/releases/download/${release_tag}/GhosttyKit.xcframework.zip"

module_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
frameworks="$module_root/ios/Frameworks"
framework="$frameworks/GhosttyKit.xcframework"
record="$frameworks/.ghosttykit-release"

sha256() {
  if command -v shasum >/dev/null; then shasum -a 256 "$1" | awk '{print $1}'
  else sha256sum "$1" | awk '{print $1}'; fi
}

if [[ "${1:-}" == "--verify" ]]; then
  if [[ -d "$framework" && -f "$record" && "$(cat "$record")" == "$release_tag $asset_sha256" ]]; then
    echo "GhosttyKit $release_tag is installed."
    exit 0
  fi
  echo "GhosttyKit $release_tag is not installed at $framework." >&2
  exit 1
fi

if [[ -d "$framework" && -f "$record" && "$(cat "$record")" == "$release_tag $asset_sha256" && "${1:-}" != "--force" ]]; then
  echo "GhosttyKit $release_tag already installed."
  exit 0
fi

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT
archive="$workdir/GhosttyKit.xcframework.zip"

echo "Downloading GhosttyKit $release_tag"
curl --fail --location --silent --show-error --output "$archive" "$asset_url"

actual="$(sha256 "$archive")"
if [[ "$actual" != "$asset_sha256" ]]; then
  echo "GhosttyKit archive checksum mismatch: expected $asset_sha256, got $actual" >&2
  exit 1
fi

mkdir -p "$workdir/unpacked"
if command -v ditto >/dev/null; then ditto -x -k "$archive" "$workdir/unpacked"
else unzip -q "$archive" -d "$workdir/unpacked"; fi
if [[ ! -d "$workdir/unpacked/GhosttyKit.xcframework" ]]; then
  echo "The archive has no GhosttyKit.xcframework at its root." >&2
  exit 1
fi

rm -rf "$framework" "$record"
mkdir -p "$frameworks"
mv "$workdir/unpacked/GhosttyKit.xcframework" "$framework"
echo "$release_tag $asset_sha256" >"$record"
echo "Installed GhosttyKit $release_tag at $framework"
