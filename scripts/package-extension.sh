#!/usr/bin/env bash
# Builds the extension and zips it for the release and the stores, the same bytes for
# the same commit on every computer (decision 0013). Edge installs from the Chrome Web
# Store as well, and Firefox takes the same zip, because the one manifest names what
# each browser runs (decision 0012).
#   bash scripts/package-extension.sh [FOLDER] [VERSION]
# writes FOLDER/player-switch-for-autodarts-<version>.zip, dist/ by default, and prints
# its path; scripts/package-extension.ts says what goes in and what VERSION does.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# From nothing, so that a file of an earlier build stays out of the zip.
rm -rf extension/lib
npm run --silent build

node scripts/package-extension.ts "$@"
