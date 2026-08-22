#!/usr/bin/env bash
# Extracts only wp-content/uploads out of the 1.7GB home-directory backup archive.
# The archive also contains .ssh/id_rsa and wp-config.php credentials: never
# extract it in full, only this one subtree.
set -euo pipefail
TAR=${1:?path to backup_philippegronon.com_*.tar}
DEST=${2:-./uploads}
mkdir -p "$DEST"
tar xf "$TAR" --wildcards -O backup_user-data_*.tzst \
  | zstd -dc \
  | tar xf - -C "$DEST" --strip-components=3 httpdocs/wp-content/uploads
echo "uploads extracted to $DEST"
