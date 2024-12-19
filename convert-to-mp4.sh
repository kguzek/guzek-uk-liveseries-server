#!/usr/bin/bash

DAEMON_DIR="/var/lib/transmission-daemon"
LOG_FILE="$DAEMON_DIR/script-done.log"
MKV_PATTERN='\.mkv$'

if [[ $TR_TORRENT_NAME = "" ]]; then
  FILE="$1"
else
  FILE="$TR_TORRENT_DIR/$TR_TORRENT_NAME"
fi

function log {
  echo "$1"
  echo "$(date +'%F @ %T'): $1" >>/var/lib/transmission-daemon/script-done.log
}

function convert {
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
  ffmpeg -hide_banner -loglevel warning -i "$1" -c:v copy -c:a aac -c:s mov_text -movflags +faststart "$1.mp4" && log "File conversion completed successfully" || log "Non-zero exit code while running ffmpeg"
}

log "File '$FILE' has finished downloading"

if [[ -d $FILE ]]; then
  log "This file is a directory, iterating contents"
  for filename in "$FILE"/*; do
    if [[ $filename =~ $MKV_PATTERN ]]; then
      convert "$filename"
      break
    fi
  done
  log "Done iterating"
elif [[ -f $FILE ]]; then
  if [[ $FILE =~ $MKV_PATTERN ]]; then
    convert "$FILE"
  else
    log "Standalone file is not a video file"
  fi
else
  log "Invalid file path '$FILE'"
fi
