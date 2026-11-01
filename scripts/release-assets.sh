#!/usr/bin/env bash
# What a release of this project ships beside its SBOMs and its notices: the zip of the
# extension, ready to load, for whoever installs it without the store and for
# publish-store.yml, which sends the Chrome Web Store exactly this file (decision 0013).
#
#   bash scripts/release-assets.sh FOLDER VERSION
#
# The job "assets of the project" of .github/workflows/build-release.yml runs this at
# the commit of the release, after npm ci --ignore-scripts, without a token that may
# write, a secret, sudo or Docker. The job "release assets" takes the file from there,
# describes it in the SBOMs, attests it and attaches it to the draft of the release;
# verify-release.yml then fails for a zip without that provenance.
set -euo pipefail

if (($# != 2)); then
  echo "Usage: bash scripts/release-assets.sh FOLDER VERSION" >&2
  exit 2
fi
bash "$(dirname "${BASH_SOURCE[0]}")/package-extension.sh" "$1" "$2"
