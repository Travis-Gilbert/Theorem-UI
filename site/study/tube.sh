#!/bin/sh
# What plays on the tube: Theorem's main pane from the recorded turn, an answer on
# screen and the follow-up being typed, cut to the tube's 1.385:1 raster. The rail
# and chat list are left out so the conversation fills the glass. Run from site/.
exec ffmpeg -v error -y -ss 70 -t 36 -i film/public/capture/turn-desktop.mp4 \
  -vf "crop=1011:720:269:0,scale=1014:732:flags=lanczos,setsar=1" \
  -c:v libx264 -crf 19 -preset slow -pix_fmt yuv420p -an -movflags +faststart \
  public/study/tube.mp4
