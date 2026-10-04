#!/bin/bash
set -e

# This script is called by semantic-release to zip the built plugin so it can be uploaded as a release asset
# Arguments:
#   $1 - The new version being released

VERSION=$1
SOURCE_DIR="packages/tv-plugin/dist"
OUT_DIR="dist-release"
ZIP_NAME="stash-tv-$VERSION.zip"

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

# Stash expects the plugin's files (including stash-tv.yml) at the root of the zip
ZIP_PATH="$(cd "$OUT_DIR" && pwd)/$ZIP_NAME"
pushd "$SOURCE_DIR" > /dev/null
zip -r "$ZIP_PATH" . -x "*.DS_Store" > /dev/null
popd > /dev/null

echo "Packaged plugin as $OUT_DIR/$ZIP_NAME"
