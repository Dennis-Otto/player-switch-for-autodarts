#!/usr/bin/env bash
# The asset that this project adds to every release: the zip of the extension.
#   bash scripts/release-assets.sh FOLDER VERSION
# The job "assets of the project" of .github/workflows/build-release.yml runs it from the
# signed tag, with a token that may only read, and the release attests and attaches
# what it wrote into FOLDER. .github/workflows/publish-store.yml then uploads exactly
# that zip to the Chrome Web Store (decision 0013).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

bash scripts/package-extension.sh "${1:?the folder for the assets}" "${2:?the version of the release}"
