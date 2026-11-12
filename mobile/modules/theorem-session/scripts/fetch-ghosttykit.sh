#!/usr/bin/env bash
# SOURCING: Remux scripts/fetch_ghosttykit.sh at the vendored revision (same release tag and checksum)
#
# Installs the prebuilt ReleaseFast GhosttyKit.xcframework the vendored Remux
# sources were built against, after checking the archive's SHA-256. Runs on
# macOS (EAS builders, Xcode machines); --verify only checks what is installed.
#
# The release also carries a macOS slice whose library is named
# ghostty-internal.a, where the iOS slices use libghostty-internal.a. CocoaPods
# refuses a vendored xcframework whose static libraries are named differently,
# so the install keeps only the iOS slices (the app ships for iOS only).
set -euo pipefail

release_tag="ghosttykit-20261104"
asset_sha256="5f4e70713b9a55e07bba40754bd72e4b453467cacc20814a9d915c65934db957"
asset_url="https://github.com/h3nock/remux-ghostty/releases/download/${release_tag}/GhosttyKit.xcframework.zip"

module_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
frameworks="$module_root/ios/Frameworks"
framework="$frameworks/GhosttyKit.xcframework"
record="$frameworks/.ghosttykit-release"
# The record names the trim too, so a full framework from an earlier install is replaced.
installed="$release_tag $asset_sha256 ios-only"

sha256() {
  if command -v shasum >/dev/null; then shasum -a 256 "$1" | awk '{print $1}'
  else sha256sum "$1" | awk '{print $1}'; fi
}

if [[ "${1:-}" == "--verify" ]]; then
  if [[ -d "$framework" && -f "$record" && "$(cat "$record")" == "$installed" ]]; then
    echo "GhosttyKit $release_tag is installed."
    exit 0
  fi
  echo "GhosttyKit $release_tag is not installed at $framework." >&2
  exit 1
fi

if [[ -d "$framework" && -f "$record" && "$(cat "$record")" == "$installed" && "${1:-}" != "--force" ]]; then
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

# Drop every non-iOS slice: its directory and its AvailableLibraries entry.
python3 -I - "$workdir/unpacked/GhosttyKit.xcframework" <<'PY'
import pathlib, plistlib, shutil, sys

root = pathlib.Path(sys.argv[1])
info_path = root / "Info.plist"
info = plistlib.loads(info_path.read_bytes())
keep = []
for library in info["AvailableLibraries"]:
    if library.get("SupportedPlatform") == "ios":
        keep.append(library)
    else:
        shutil.rmtree(root / library["LibraryIdentifier"])
names = {library["BinaryPath"] for library in keep}
variants = sorted(library.get("SupportedPlatformVariant", "device") for library in keep)
if variants != ["device", "simulator"]:
    sys.exit(f"GhosttyKit: expected one iOS device slice and one iOS simulator slice, found {variants}")
if len(names) != 1:
    sys.exit(f"GhosttyKit: the iOS slices name their libraries differently: {sorted(names)}")
info["AvailableLibraries"] = keep
info_path.write_bytes(plistlib.dumps(info))
PY

rm -rf "$framework" "$record"
mkdir -p "$frameworks"
mv "$workdir/unpacked/GhosttyKit.xcframework" "$framework"
echo "$installed" >"$record"
echo "Installed GhosttyKit $release_tag at $framework"
