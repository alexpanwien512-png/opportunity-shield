#!/bin/sh
# Frame-by-frame check of a video: extracts frames (default 2 per second) and OCRs them for banned words.
# Usage: FFMPEG=/path/to/ffmpeg scripts/media/check-video.sh docs/demo.mp4 [fps]
set -e
VIDEO="$1"
FPS="${2:-2}"
FFMPEG="${FFMPEG:-ffmpeg}"
OUT="$(mktemp -d)"
"$FFMPEG" -hide_banner -loglevel error -i "$VIDEO" -vf "fps=$FPS" "$OUT/f%05d.png"
swift "$(dirname "$0")/ocr-frames.swift" "$OUT"
