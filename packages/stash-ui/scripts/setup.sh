#!/usr/bin/env bash

# Enable strict mode
# http://redsymbol.net/articles/unofficial-bash-strict-mode/
set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/fingerprint.sh"

# The Stash versions are in stash-versions.json (see docs/stash-compatibility.md):
# - develop: the Stash commit stash-ui is built from. The Stash UI code Stash TV reuses (and its GraphQL queries) comes
#   from here.
# - the releases Stash TV supports. They're only used by the tests: their GraphQL schema files are copied out (below)
#   for mock-stash to serve, and nothing of them goes into the plugin.
STASH_VERSIONS_FILE="$SCRIPT_DIR/../stash-versions.json"
STASH_VERSION="$(jq -er '.develop.commit' "$STASH_VERSIONS_FILE")"

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

# For the tests only: the plugin doesn't use any of this. Copy each release's GraphQL schema files (graphql/schema/ in
# Stash's repo) into release-schemas/<release>/, so mock-stash can serve that version's schema and the tests can check
# Stash TV works against it. Read straight from the tag with `git archive`, so the stash/ checkout stays on
# STASH_VERSION and nothing of the release is checked out or built.
{
  cd "$SCRIPT_DIR/../stash"
  rm -rf "$RELEASE_SCHEMAS_DIR"
  for release in $(jq -r 'to_entries[] | select(.value.tag) | .key' "$STASH_VERSIONS_FILE"); do
    tag="$(jq -er --arg release "$release" '.[$release].tag' "$STASH_VERSIONS_FILE")"
    commit="$(jq -er --arg release "$release" '.[$release].commit' "$STASH_VERSIONS_FILE")"
    if ! git rev-parse -q --verify "refs/tags/$tag" > /dev/null; then
      git fetch --no-tags origin "refs/tags/$tag:refs/tags/$tag"
    fi
    # The commit is recorded so the tests can tell without git whether develop is one of the releases
    tag_commit="$(git rev-parse "$tag^{commit}")"
    if [ "$tag_commit" != "$commit" ]; then
      echo "stash-versions.json gives $release ($tag) the commit $commit, but $tag is $tag_commit" >&2
      exit 1
    fi
    mkdir -p "$RELEASE_SCHEMAS_DIR/$release"
    git archive "$tag" graphql/schema | tar -x -C "$RELEASE_SCHEMAS_DIR/$release" --strip-components=2
  done
};

{
  cd "$SCRIPT_DIR/../stash/ui/v2.5"
  pnpm install --frozen-lockfile
};

write_setup_stamp
