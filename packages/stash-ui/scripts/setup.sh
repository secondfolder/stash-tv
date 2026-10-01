#!/usr/bin/env bash

# Enable strict mode
# http://redsymbol.net/articles/unofficial-bash-strict-mode/
set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/fingerprint.sh"

STASH_VERSION="v0.28.1"

# Clear the stamp so a failed setup isn't mistaken for a completed one
rm -f "$SETUP_STAMP"

{
  cd "$SCRIPT_DIR/.."
  git submodule update --init --recursive
};

{
  cd "$SCRIPT_DIR/../stash"
  git reset --hard "$STASH_VERSION"
  exclude_file="$(git rev-parse --git-dir)/info/exclude"
  grep -qxF 'ui/v2.5/graphql/stash-tv.graphql' "$exclude_file" 2>/dev/null \
    || echo 'ui/v2.5/graphql/stash-tv.graphql' >> "$exclude_file"
  rm -f ui/v2.5/graphql/stash-tv.graphql
  git apply ../patches/stash-tv.patch
};

{
  cd "$SCRIPT_DIR/../stash/ui/v2.5"
  yarn install
};

write_setup_stamp
