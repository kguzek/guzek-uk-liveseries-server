#!/usr/bin/env bash

LOG_DIRECTORY=/var/log/transmission
if [ ! -d "$LOG_DIRECTORY" ]; then
  mkdir -p "$LOG_DIRECTORY"
fi
LOG_FILE="$LOG_DIRECTORY/script-done.log"
if [ ! -f "$LOG_FILE" ]; then
  touch "$LOG_FILE" || echo "Failed to create log file as $(whoami)"
fi
VIDEO_PATTERN='\.(mkv|avi)$'

if [[ "$TR_TORRENT_NAME" = "" ]]; then
  FILE="$1"
else
  FILE="$TR_TORRENT_DIR/$TR_TORRENT_NAME"
fi

log() {
  echo "$1"
  echo "$(date +'%F @ %T'): $1" >>"$LOG_FILE" || echo "Failed to write to log file as $(whoami)"
}

convert() {
  log "Checking file '$1'"
  if [[ $1 =~ \.mp4$ ]]; then
    log "File is already in MP4 format"
    return
  fi
  log "Converting file to MP4 format"
  if [[ -f "$1.mp4" ]]; then
    log "This file has already been converted"
    return
  fi
  # Filters out ffmpeg's output to avoid cluttering the log,
  # ensures better video compatibility with some devices (like mobile browsers),
  # converts the audio streams into stereo (with an appropriate bitrate and sample rate) to ensure music isn't separated from dialogue tracks,
  # and adds the moov atom at the beginning of the file for faster streaming.
  if ffmpeg -hide_banner -loglevel warning -i "$1" \
    -c:v libx264 -profile:v main -pix_fmt yuv420p -level 4.0 -preset medium -crf 23 \
    -c:a aac -profile:a aac_low -b:a 128k -ac 2 -ar 44100 \
    -movflags +faststart "$1.mp4"; then
    log "File conversion completed successfully"
  else
    log "Non-zero exit code while running ffmpeg"
  fi
}

log "File '$FILE' has finished downloading"

if [[ -d $FILE ]]; then
  log "This file is a directory, iterating contents"
  for filename in "$FILE"/*; do
    if [[ $filename =~ $VIDEO_PATTERN ]]; then
      convert "$filename"
      break
    fi
  done
  log "Done iterating"
elif [[ -f $FILE ]]; then
  if [[ $FILE =~ $VIDEO_PATTERN ]]; then
    convert "$FILE"
  else
    log "Standalone file is not a video file"
  fi
else
  log "Invalid file path '$FILE'"
fi
