#!/bin/bash
set -e

# This script is called by semantic-release once a release has been published, to have the stash-plugins repo redeploy
# its site, which points Stash at the plugin zip uploaded as an asset of the latest release.
# Arguments:
#   $1 - The new version being released

VERSION=$1
STASH_PLUGINS_REPO="secondfolder/stash-plugins"

echo "Requesting $STASH_PLUGINS_REPO deploy version $VERSION"

GH_TOKEN="$CI_GITHUB_TOKEN" gh api "repos/$STASH_PLUGINS_REPO/dispatches" -f event_type=deploy

echo "Requested deploy. See https://github.com/$STASH_PLUGINS_REPO/actions/workflows/deploy.yml"
