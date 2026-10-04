#!/bin/bash
set -e

# This script is called by semantic-release once a release has been published, to have the stash-plugins repo's
# publish-plugin workflow add the release's plugin zip (uploaded as a release asset) to the plugin repository.
# Arguments:
#   $1 - The new version being released

VERSION=$1
REPO="secondfolder/stash-tv"
STASH_PLUGINS_REPO="secondfolder/stash-plugins"

echo "Requesting $STASH_PLUGINS_REPO publish version $VERSION"

GH_TOKEN="$CI_GITHUB_TOKEN" gh api "repos/$STASH_PLUGINS_REPO/dispatches" \
  -f event_type=publish-plugin \
  -f "client_payload[repo]=$REPO" \
  -f "client_payload[tag]=v$VERSION"

echo "Requested publish. See https://github.com/$STASH_PLUGINS_REPO/actions/workflows/publish-plugin.yml"
