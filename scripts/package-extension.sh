#!/usr/bin/env bash
# Builds the extension and zips it for the Chrome Web Store, which Edge installs from
# as well; Firefox takes the same zip, because the one manifest names what each browser
# runs (decision 0012). The manifest must sit at the root of the zip, so this zips the
# contents of extension/, not the folder.
#   bash scripts/package-extension.sh  ->  dist/player-switch-for-autodarts-<version>.zip
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

npm run --silent build

version="$(grep -oE '"version": *"[^"]+"' extension/manifest.json | grep -oE '[0-9][^"]*')"
out="dist"
zip_path="$out/player-switch-for-autodarts-$version.zip"
mkdir -p "$out"
rm -f "$zip_path"

if command -v zip >/dev/null 2>&1; then
  (cd extension && zip -r -q "../$zip_path" . -x '*.map' 'biome.jsonc')
elif command -v powershell >/dev/null 2>&1; then
  powershell -NoProfile -Command \
    "Get-ChildItem -Path 'extension' -Exclude 'biome.jsonc' | Compress-Archive -DestinationPath '$zip_path' -Force"
  echo "Warning: built with PowerShell, which uses backslashes in the archive." >&2
  echo "The Chrome Web Store prefers forward slashes, and addons.mozilla.org refuses" >&2
  echo "backslashes; install 'zip' (or use WSL or the CI) for the upload archive." >&2
else
  echo "Need 'zip' or PowerShell to build the archive." >&2
  exit 1
fi

echo "Wrote $zip_path"
