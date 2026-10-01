#!/usr/bin/env bash

# Enable strict mode
# http://redsymbol.net/articles/unofficial-bash-strict-mode/
set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/fingerprint.sh"

{
  cd "$SCRIPT_DIR/../stash"
  git add -f ui/v2.5/graphql/stash-tv.graphql
  git diff --cached > ../patches/stash-tv.patch
  git restore --staged ui/v2.5/graphql/stash-tv.graphql
};

# stash/ now matches the new patch, so record it as setup's state. Otherwise ensure-ready.sh
# would see a changed patch plus a "locally edited" checkout and refuse to set up again.
write_setup_stamp
