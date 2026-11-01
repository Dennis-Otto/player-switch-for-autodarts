#!/usr/bin/env bash
# Checks of this project alone, run last by scripts/check.sh.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# Every language of extension/_locales must carry the messages of English with the
# same placeholders and its own code in "locale", every message the UI asks for must
# exist, every message must be asked for, and the texts and names that the pages carry
# themselves must read as their English messages.
node scripts/check-locales.mjs

# Every file the manifest names must exist, and the switcher in the page must show the
# tiles of the popup.
node scripts/check-pages.mjs

# On top of scripts/check-manifest.mjs of the blueprint, in the step "Extension": the
# manifest asks for exactly the permissions, hosts and web-accessible pages that
# store/permissions.json allows, the store listing of every language justifies them
# and has the texts of its pictures, its content security policy connects only to
# those hosts, and it runs in Firefox. The checker tests itself first, with fixture
# manifests that each break one rule.
node --test --test-reporter=dot scripts/check-extension.test.mjs
node scripts/check-extension.mjs

# Firefox and Edge run the same extension as Chrome. addons-linter, the linter of
# addons.mozilla.org that `web-ext lint` runs, finds no error in it and only the
# warnings that scripts/check-firefox.mjs accepts with their reason (decision 0012).
# The checker tests itself first, with made-up results of the linter.
node --test --test-reporter=dot scripts/check-firefox.test.mjs
node scripts/check-firefox.mjs

# Two builds of one commit make the same zip, byte for byte, in another time zone too,
# so that anybody can check the zip of a release against the source of its tag. The
# second build is the one of a release, with the version that the release passes to the
# script of the blueprint (decisions 0013 and 0014).
zips="$(mktemp -d)"
trap 'rm -rf "$zips"' EXIT
first="$(bash scripts/package-extension.sh "$zips/first")"
version="$(grep -oE '"version": *"[^"]+"' extension/manifest.json | grep -oE '[0-9][^"]*')"
second="$(TZ=Pacific/Kiritimati bash scripts/package-extension.sh "$zips/second" "$version")"
if ! cmp -s "$first" "$second"; then
  echo "Two builds of this commit make different zips, which nobody could check against the"
  echo "source of the tag. Something that scripts/package-extension.sh packs depends on the"
  echo "time or the computer: compare $first and $second, or the output of npm run build."
  exit 1
fi
echo "Two builds of the zip of this commit are the same, byte for byte."

# The help explains every message that tells a player about a problem, in English and
# German, and Help in every language of the extension leads to it, or to the English
# help where the website has none in that language.
node scripts/check-help.mjs

# The popup in a real browser, with the extension/lib/ that scripts/check.sh built:
# axe-core in every view, targets of 44 by 44 pixels, and the focus after every action
# of a walk with the keyboard alone (test/harness/a11y.mjs). Without a Chrome or an
# Edge on this computer it skips, other than in the CI.
node --test --test-reporter=dot test/harness/a11y.mjs
