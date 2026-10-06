#!/usr/bin/env bash

# Sourced by setup.sh, build.sh, update-patch.sh and ensure-ready.sh. Fingerprints are hashes
# of a step's inputs, recorded in a stamp file when the step succeeds so ensure-ready.sh can
# tell whether it needs to run again.

STASH_UI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STASH_REPO_DIR="$STASH_UI_DIR/stash"
# The latest Stash release's GraphQL schema, extracted by setup.sh
RELEASE_SCHEMA_DIR="$STASH_UI_DIR/release-schema"
# Line 1: setup fingerprint, line 2: stash tree fingerprint as setup left it
SETUP_STAMP="$STASH_UI_DIR/.local/setup-stamp"
# Lives in dist/ so build.sh's clean of dist/ also removes it
BUILD_STAMP="$STASH_UI_DIR/dist/.build-stamp"

# Hashes the given files (paths relative to the stash-ui package). Missing files hash as absent
# rather than failing, e.g. stash/ui/v2.5/pnpm-lock.yaml before the submodule is initialised.
hash_files() {
  (
    cd "$STASH_UI_DIR"
    for file in "$@"; do
      echo "--- $file"
      if [ -f "$file" ]; then
        cat "$file"
      fi
    done
  ) | git hash-object --stdin
}

# Inputs to setup.sh: the pinned Stash version (in setup.sh), the patch and Stash's UI deps
setup_fingerprint() {
  hash_files scripts/setup.sh patches/stash-tv.patch stash/ui/v2.5/pnpm-lock.yaml
}

# The state of the Stash checkout: its commit plus every uncommitted change, including
# stash-tv.graphql which setup.sh hides from git via info/exclude
stash_tree_fingerprint() {
  (
    cd "$STASH_REPO_DIR"
    git rev-parse HEAD
    git diff HEAD
    while IFS= read -r -d '' file; do
      cat "$file"
    done < <(git ls-files -z --others --exclude-standard)
    cat ui/v2.5/graphql/stash-tv.graphql 2>/dev/null || true
  ) | git hash-object --stdin
}

# Inputs to build.sh: the Stash checkout it compiles plus our build scripts and patch files
build_fingerprint() {
  {
    setup_fingerprint
    stash_tree_fingerprint
    hash_files \
      patches/scene-player-utils.ts \
      theme-vars-as-css-vars.scss \
      scripts/build.sh \
      scripts/compile-ts.sh \
      scripts/compile-sass.ts \
      scripts/generate-ql.sh
  } | git hash-object --stdin
}

write_setup_stamp() {
  mkdir -p "$(dirname "$SETUP_STAMP")"
  { setup_fingerprint; stash_tree_fingerprint; } > "$SETUP_STAMP"
}
