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

# The help explains every message that tells a player about a problem, in both
# languages, and Help in the extension leads to it.
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
