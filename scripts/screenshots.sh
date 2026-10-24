#!/usr/bin/env bash
# Renders the pictures of this repository in place, for the screenshot bot. After a
# change of main that touches a file of .github/screenshots-paths.txt, after every
# release and every week, the Screenshots workflow runs this script and opens a pull
# request with each picture whose pixels changed; one whose pixels stayed the same
# keeps its file. To see what it would change, run it, then
# `python3 .github/blueprint.py screenshots restore`, which gives every picture that
# looks the same its committed file back and lists the others. It needs Pillow:
# `python3 -m pip install --require-hashes -r .github/screenshots-requirements.txt`.
#
# It renders the social preview, .github/social-preview.png, from
# .github/social-preview.html, and the pictures of the extension from its real pages,
# with made-up accounts (test/harness/, docs/development.md#pictures):
#
# - docs/images/switch.gif, an animated tap that switches players, for the README and
#   the website, and the popup's "Manage accounts" (manage.png) and the switcher on a
#   board display (switcher.png), each also .dark and in German (.de, .de.dark);
# - store/images/, the screenshots (1280×800) and the promo tiles (440×280 and
#   1400×560) of the Chrome Web Store, in English (.en) and German (.de).
#
# It needs Docker, and Node for the code of the extension. The blueprint brought it
# once; it belongs to this project.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

bash scripts/social-preview.sh

# The extension as it ships: its code in extension/lib/, compiled from src/.
if [[ ! -x node_modules/.bin/tsc ]]; then
  npm ci --ignore-scripts --no-audit --no-fund
fi
npm run --silent build

# The browser and the Python of Playwright, at the version of playwright in
# test/harness/requirements.in. Renovate keeps both current.
image="mcr.microsoft.com/playwright/python:v1.63.0-noble@sha256:72bd171a9ffc2b4b59532aaa6210e21014d07093120dc25528870c0b840da1f0"
# Git Bash on Windows: keep the container's paths and mount the Windows path.
export MSYS_NO_PATHCONV=1
root="$(pwd -W 2>/dev/null || pwd)"
archive="$(mktemp)"
log="$(mktemp)"
trap 'rm -f "$archive" "$log"' EXIT

# The repository is read-only in the container; the pictures leave it as a tar
# archive through stdout, so they belong to whoever runs this.
if docker run --rm --volume "$root:/work:ro" --workdir /work "$image"   bash test/harness/run.sh >"$archive" 2>"$log" && [[ -s "$archive" ]]; then
  tar --extract --no-same-owner --file "$archive"
  grep -E '^(docs|store)/' "$log" | sed 's/^/Rendered /'
else
  cat "$log" >&2
  echo "Rendering the pictures of the extension failed; the log above says why." >&2
  exit 1
fi
