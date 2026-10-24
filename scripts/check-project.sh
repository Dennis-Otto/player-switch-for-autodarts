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

# Every message the UI asks for must exist in both languages, every message must be
# asked for, and the two language files must carry the same keys.
node scripts/check-locales.mjs

# Every file the manifest names must exist, and the switcher in the page must show the
# tiles of the popup.
node scripts/check-pages.mjs

# The manifest asks for exactly the permissions, hosts and web-accessible pages that
# store/permissions.json allows, both store listings justify them, its content security
# policy connects only to those hosts, and it fits the store. The checker tests itself
# first, with fixture manifests that each break one rule.
node --test --test-reporter=dot scripts/check-manifest.test.mjs
node scripts/check-manifest.mjs

# The help explains every message that tells a player about a problem, in both
# languages, and Help in the extension leads to it.
node scripts/check-help.mjs
