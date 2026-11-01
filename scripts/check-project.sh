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

# Every language of extension/_locales must carry the messages of English with the
# same placeholders and its own code in "locale", every message the UI asks for must
# exist, every message must be asked for, and the texts and names that the pages carry
# themselves must read as their English messages.
node scripts/check-locales.mjs

# Every file the manifest names must exist, and the switcher in the page must show the
# tiles of the popup.
node scripts/check-pages.mjs

# The manifest asks for exactly the permissions, hosts and web-accessible pages that
# store/permissions.json allows, the store listing of every language justifies them
# and has the texts of its pictures,
# its content security policy connects only to those hosts, and it fits the store. The checker tests itself
# first, with fixture manifests that each break one rule.
node --test --test-reporter=dot scripts/check-manifest.test.mjs
node scripts/check-manifest.mjs

# Firefox and Edge run the same extension as Chrome. addons-linter, the linter of
# addons.mozilla.org that `web-ext lint` runs, finds no error in it and only the
# warnings that scripts/check-firefox.mjs accepts with their reason (decision 0012).
# The checker tests itself first, with made-up results of the linter.
node --test --test-reporter=dot scripts/check-firefox.test.mjs
node scripts/check-firefox.mjs

# Two builds of one commit make the same zip, byte for byte, in another time zone too,
# so that anybody can check the zip of a release against the source of its tag, and the
# zip holds only the kinds of file that scripts/package-extension.sh allows (decision
# 0013). The second build is the one of a release, by the script that the release runs.
zips="$(mktemp -d)"
trap 'rm -rf "$zips"' EXIT
first="$(bash scripts/package-extension.sh "$zips/first")"
second="$(TZ=Pacific/Kiritimati bash scripts/release-assets.sh "$zips/second" "$manifest")"
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

# The workflow that holds the token of the Chrome Web Store lets each of its jobs reach
# only the hosts that the job needs, without sudo and containers, on a runner image
# that doesn't move under it (decision 0005). A job that goes back to recording its
# traffic only, or to ubuntu-latest, fails here.
store=.github/workflows/publish-store.yml
wrong="$(grep -nE '^ +(runs-on|egress-policy|disable-sudo-and-containers):' "$store" |
  grep -vE '^[0-9]+:(    runs-on: ubuntu-[0-9]+\.[0-9]+| +egress-policy: block| +disable-sudo-and-containers: true)$' || true)"
jobs="$(grep -cE '^    runs-on:' "$store" || true)"
for setting in 'egress-policy: block' 'allowed-endpoints: >' 'disable-sudo-and-containers: true'; do
  count="$(grep -cE "^ +$setting\$" "$store" || true)"
  if [[ "$count" != "$jobs" ]]; then
    wrong+="${wrong:+$'\n'}$count of the $jobs jobs set $setting"
  fi
done
if [[ -n "$wrong" ]]; then
  echo "$store: each job runs on a pinned runner image, such as ubuntu-24.04, and starts with"
  echo "step-security/harden-runner with egress-policy: block, the hosts that it needs in"
  echo "allowed-endpoints and disable-sudo-and-containers: true. Not so here:"
  echo "$wrong"
  exit 1
fi
echo "Each of the $jobs jobs of $store reaches only the hosts that it needs."

# The popup in a real browser, with the extension/lib/ that scripts/check.sh built:
# axe-core in every view, targets of 44 by 44 pixels, and the focus after every action
# of a walk with the keyboard alone (test/harness/a11y.mjs). Without a Chrome or an
# Edge on this computer it skips, other than in the CI.
node --test --test-reporter=dot test/harness/a11y.mjs
