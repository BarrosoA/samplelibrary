#!/usr/bin/env bash
set -euo pipefail

# batch opus encoder for previews
# input dir with wav/flac, output dir for opus previews

INPUT_DIR="${1:-./raw-samples}"
OUTPUT_DIR="${2:-./previews}"
BITRATE="${3:-144k}"

if ! command -v ffmpeg &> /dev/null; then
  echo "ffmpeg not found in PATH"
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

echo "Encoding audio files from $INPUT_DIR to $OUTPUT_DIR at $BITRATE..."

# loop input audio files
shopt -s nullglob nocaseglob
for file in "$INPUT_DIR"/*.wav "$INPUT_DIR"/*.flac "$INPUT_DIR"/*.aif "$INPUT_DIR"/*.aiff; do
  [ -f "$file" ] || continue
  filename=$(basename "$file")
  basename="${filename%.*}"
  output_file="$OUTPUT_DIR/${basename}.opus"

  echo "Encoding: $filename -> ${basename}.opus"
  # libopus encode at target bitrate
  ffmpeg -y -v warning -i "$file" -c:a libopus -b:a "$BITRATE" -vbr on "$output_file"
done

echo "Done. Preview files ready in $OUTPUT_DIR"

