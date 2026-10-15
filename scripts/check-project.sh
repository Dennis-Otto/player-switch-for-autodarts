#!/usr/bin/env bash
# Checks of this project alone, run last by scripts/check.sh.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# The extension's manifest ships its own version to the store, so it must match the
# version the release bot keeps in package.json.
release="$(grep -oE '"\.": *"[^"]+"' .release-please-manifest.json | grep -oE '[0-9][^"]*')"
manifest="$(grep -oE '"version": *"[^"]+"' extension/manifest.json | grep -oE '[0-9][^"]*')"
if [[ "$manifest" != "$release" ]]; then
  echo "extension/manifest.json has version ${manifest:-none}; the release bot has $release."
  exit 1
fi
echo "The manifest version is $manifest."

# Every message the UI asks for must exist in both languages, and the two language
# files must carry the same keys.
node scripts/check-locales.mjs
