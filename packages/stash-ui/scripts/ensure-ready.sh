#!/usr/bin/env bash

# Runs setup.sh and/or build.sh only if their inputs changed since they last succeeded.
# Never resets a Stash checkout that has edits setup.sh didn't make.

# Enable strict mode
# http://redsymbol.net/articles/unofficial-bash-strict-mode/
set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/fingerprint.sh"

log() {
  echo "stash-ui: $*"
}

setup_reason=""
if [ ! -e "$STASH_REPO_DIR/.git" ]; then
  setup_reason="Stash submodule not initialised"
elif [ ! -d "$STASH_REPO_DIR/ui/v2.5/node_modules" ]; then
  setup_reason="Stash UI dependencies not installed"
elif [ ! -f "$SETUP_STAMP" ]; then
  setup_reason="no record of a previous setup"
elif [ "$(setup_fingerprint)" != "$(sed -n 1p "$SETUP_STAMP")" ]; then
  setup_reason="Stash version or patches/stash-tv.patch changed"
fi

# Whether stash/ has changes setup.sh didn't make, which setup's `git reset --hard` would destroy
has_foreign_stash_changes() {
  if [ ! -e "$STASH_REPO_DIR/.git" ]; then
    return 1
  fi
  if [ -f "$SETUP_STAMP" ]; then
    [ "$(stash_tree_fingerprint)" != "$(sed -n 2p "$SETUP_STAMP")" ]
    return
  fi
  # No stamp to compare against, so treat changes to files outside the patch as foreign
  local patch_files changed_files
  patch_files="$(sed -n 's|^diff --git a/\([^ ]*\) .*|\1|p' "$STASH_UI_DIR/patches/stash-tv.patch")"
  changed_files="$(git -C "$STASH_REPO_DIR" status --porcelain | cut -c4-)"
  [ -n "$(comm -13 <(sort <<< "$patch_files") <(sort <<< "$changed_files"))" ]
}

ran_setup=""
if [ -n "$setup_reason" ]; then
  if has_foreign_stash_changes; then
    log "setup needed ($setup_reason) but stash/ has changes setup didn't make, so leaving it alone."
    log "Save any edits you want to keep with 'yarn --cwd packages/stash-ui update:patch', then run 'yarn --cwd packages/stash-ui setup'."
  else
    if [ ! -f "$SETUP_STAMP" ] && [ -e "$STASH_REPO_DIR/.git" ] \
      && [ -n "$(git -C "$STASH_REPO_DIR" status --porcelain)" ]; then
      # Changes are confined to patched files but may still include edits on top of the patch
      backup_dir="$STASH_UI_DIR/.local/stash-backup-$(date +%Y%m%d-%H%M%S)"
      mkdir -p "$backup_dir"
      git -C "$STASH_REPO_DIR" diff HEAD > "$backup_dir/changes.patch"
      cp "$STASH_REPO_DIR/ui/v2.5/graphql/stash-tv.graphql" "$backup_dir/" 2>/dev/null || true
      log "backed up uncommitted changes in stash/ to $backup_dir"
    fi
    log "running setup ($setup_reason)"
    "$SCRIPT_DIR/setup.sh"
    ran_setup=1
  fi
fi

build_reason=""
if [ -n "$ran_setup" ]; then
  build_reason="setup was re-run"
elif [ ! -f "$BUILD_STAMP" ]; then
  build_reason="no previous build"
elif [ "$(build_fingerprint)" != "$(cat "$BUILD_STAMP")" ]; then
  build_reason="build inputs changed"
fi

if [ -n "$build_reason" ]; then
  log "building ($build_reason)"
  "$SCRIPT_DIR/build.sh"
else
  log "up to date"
fi
