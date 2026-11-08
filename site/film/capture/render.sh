#!/usr/bin/env bash
# Renders every published film asset into site/public/film. Run from site/film.
set -euo pipefail
OUT=../public/film
bun capture/captions.ts
bunx remotion render TheoremDesktop "$OUT/theorem-desktop.mp4" --codec=h264 --crf=20 --audio-codec=aac --audio-bitrate=160k
bunx remotion render TheoremPhone "$OUT/theorem-phone.mp4" --codec=h264 --crf=20 --audio-codec=aac --audio-bitrate=160k
bunx remotion render TheoremTube "$OUT/theorem-tube.mp4" --codec=h264 --crf=20 --audio-codec=aac --audio-bitrate=160k
bunx remotion render AmbientDesktop "$OUT/ambient-desktop.mp4" --codec=h264 --crf=26 --muted
bunx remotion render AmbientPhone "$OUT/ambient-phone.mp4" --codec=h264 --crf=26 --muted
bunx remotion render AmbientTube "$OUT/ambient-tube.mp4" --codec=h264 --crf=26 --muted
# Moving the index to the front lets a browser start before the whole file has arrived.
for f in theorem-desktop theorem-phone theorem-tube ambient-desktop ambient-phone ambient-tube; do
  ffmpeg -y -v error -i "$OUT/$f.mp4" -c copy -movflags +faststart "$OUT/$f.tmp.mp4"
  mv "$OUT/$f.tmp.mp4" "$OUT/$f.mp4"
done
# The poster is the first frame of the loop that replaces it, taken from the loop itself.
for layout in desktop phone tube; do
  ffmpeg -y -v error -i "$OUT/ambient-$layout.mp4" -frames:v 1 -q:v 2 "$OUT/poster-$layout.jpg"
done
ls -la "$OUT"
