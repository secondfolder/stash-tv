#!/usr/bin/env bash

# Enable strict mode
# http://redsymbol.net/articles/unofficial-bash-strict-mode/
set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/fingerprint.sh"

STASH_VERSION="e7d33c9bd131f1f5d781b850de30735943fa1195" # develop
# The latest Stash release. Stash TV supports it as well as STASH_VERSION, so its schema is extracted for the tests
# that check that (see docs/stash-compatibility.md)
STASH_RELEASE_VERSION="v0.31.1"

# Clear the stamp so a failed setup isn't mistaken for a completed one
rm -f "$SETUP_STAMP"

{
  cd "$SCRIPT_DIR/.."
  # Undo a previous setup's patch first, or switching the submodule to a new Stash commit fails
  # on the patched files
  if [ -e stash/.git ]; then
    git -C stash reset --hard
  fi
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
  cd "$SCRIPT_DIR/../stash"
  if ! git rev-parse -q --verify "refs/tags/$STASH_RELEASE_VERSION" > /dev/null; then
    git fetch --no-tags origin "refs/tags/$STASH_RELEASE_VERSION:refs/tags/$STASH_RELEASE_VERSION"
  fi
  rm -rf "$RELEASE_SCHEMA_DIR"
  mkdir -p "$RELEASE_SCHEMA_DIR"
  git archive "$STASH_RELEASE_VERSION" graphql/schema | tar -x -C "$RELEASE_SCHEMA_DIR" --strip-components=2
};

{
  cd "$SCRIPT_DIR/../stash/ui/v2.5"
  pnpm install --frozen-lockfile
};

write_setup_stamp
