#!/bin/sh
# Checks vendor/openidea against the pinned upstream: every vendored file is an upstream file,
# the files that differ are exactly the ones patches/theorem-fork.patch names, and the patch is
# exactly the difference. Upstream tests are the only thing left out. Exits non-zero on drift.
#
#   sh scripts/verify-fork.sh             check
#   sh scripts/verify-fork.sh --update    rewrite patches/theorem-fork.patch from the vendored tree
#
# UPSTREAM defaults to the pinned checkout the platinum-master team keeps; set it to any checkout
# of https://github.com/ at the revision below.
set -eu

PIN=9847fd2c01db19bf5f7b7c09b17eb3afc9ef5077
here=$(cd "$(dirname "$0")/.." && pwd)
upstream=${UPSTREAM:-"/Volumes/SSD Samsung/var-18/platinum-master/upstream/openidea"}
vendored="$here/vendor/openidea"
patch_file="$here/patches/theorem-fork.patch"

if [ -d "$upstream/.git" ] || git -C "$upstream" rev-parse --git-dir >/dev/null 2>&1; then
  head=$(git -C "$upstream" rev-parse HEAD)
  [ "$head" = "$PIN" ] || { echo "upstream is at $head, expected $PIN" >&2; exit 1; }
fi

# 1. Nothing vendored that upstream does not have.
added=$(cd "$vendored" && find . -type f | sort | while read -r f; do [ -f "$upstream/$f" ] || echo "$f"; done)
[ -z "$added" ] || { echo "vendored files not in upstream:" >&2; echo "$added" >&2; exit 1; }

# 2. The files that differ, in a fixed order.
changed=$(cd "$vendored" && find . -type f | sort | while read -r f; do cmp -s "$upstream/$f" "$f" || echo "${f#./}"; done)

# 3. The patch is exactly that difference (labels carry no timestamps, so it is reproducible).
expected=$(mktemp)
trap 'rm -f "$expected"' EXIT
for f in $changed; do
  diff -u -L "a/$f" -L "b/$f" "$upstream/$f" "$vendored/$f" >>"$expected" || true
done

if [ "${1:-}" = "--update" ]; then
  cp "$expected" "$patch_file"
  echo "wrote $patch_file ($(echo "$changed" | wc -l | tr -d ' ') files)"
  exit 0
fi

cmp -s "$expected" "$patch_file" || {
  echo "patches/theorem-fork.patch does not match the vendored tree; changed files:" >&2
  echo "$changed" >&2
  diff -u "$patch_file" "$expected" | head -40 >&2
  exit 1
}

# 4. What upstream has that is not vendored is test code only.
omitted=$(cd "$upstream/src" && find . -type f | sort | while read -r f; do
  [ -f "$vendored/src/$f" ] || echo "$f"
done | grep -v -E '\.test\.tsx?$|/__tests__/|^\./test/|/__fixtures__/' || true)
[ -z "$omitted" ] || { echo "non-test upstream files missing from vendor/openidea/src:" >&2; echo "$omitted" >&2; exit 1; }

echo "vendor/openidea matches upstream $PIN plus $(echo "$changed" | wc -l | tr -d ' ') patched files:"
echo "$changed"
