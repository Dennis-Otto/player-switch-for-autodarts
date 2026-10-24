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
# asked for, the two language files must carry the same keys, and the texts and names
# that the pages carry themselves must read as their English messages.
node scripts/check-locales.mjs

# Every file the manifest names must exist, and the switcher in the page must show the
# tiles of the popup.
node scripts/check-pages.mjs

# The help explains every message that tells a player about a problem, in both
# languages, and Help in the extension leads to it.
node scripts/check-help.mjs

# The popup in a real browser, with the extension/lib/ that scripts/check.sh built:
# axe-core in every view, targets of 44 by 44 pixels, and the focus after every action
# of a walk with the keyboard alone (test/harness/a11y.mjs). Without a Chrome or an
# Edge on this computer it skips, other than in the CI.
node --test --test-reporter=dot test/harness/a11y.mjs
