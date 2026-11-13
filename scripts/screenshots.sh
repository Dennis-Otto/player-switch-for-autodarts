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
# It renders the pictures of the extension from its real pages, with made-up accounts
# (test/harness/, docs/development.md#pictures), and last the social preview, which
# shows one of them:
#
# - docs/images/switch.gif, an animated tap that switches players, for the README, and
#   switch.mp4 and switch.webp beside it, the video and its poster for the website,
#   and the popup's "Manage accounts" (manage.png), the popup on a lobby after a
#   parked player joined it (lobby.png) and the switcher on a board display
#   (switcher.png), each also .dark and in German (.de, .de.dark);
# - docs/images/popup.dark.png and popup.de.dark.png, that popup on a lobby as it
#   opens from its icon in the toolbar, cut off below its third tile: the website
#   draws the card of the project in German from popup.de.dark.png, as the English
#   card shows the social preview;
# - docs/images/load-unpacked.png, what the install from a release asks for on the page
#   chrome://extensions of the browser itself, in the same four forms;
# - store/images/, the screenshots (1280×800) and the promo tiles (440×280 and
#   1400×560) of the Chrome Web Store, in every language of extension/_locales (.en,
#   .de, .nl, .fr and .es), with the texts around the extension from
#   store/pictures.<code>.json.
# - .github/social-preview.png, from .github/social-preview.html, the picture of links
#   to the repository: the popup on a lobby (lobby.dark.png), as it opens from its icon
#   in the toolbar, beside the name of the extension and what it does.
#
# It needs Docker, and Node for the code of the extension. The blueprint brought it
# once; it belongs to this project.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# The extension as it ships: its code in extension/lib/, compiled from src/.
if [[ ! -x node_modules/.bin/tsc ]]; then
  npm ci --ignore-scripts --no-audit --no-fund
fi
npm run --silent build

# The browser and the Python of Playwright, at the version of playwright in
# test/harness/requirements.in and of @playwright/test in package.json: Renovate moves
# them in its group Playwright, and test/playwright.test.ts fails while they differ.
image="mcr.microsoft.com/playwright/python:v1.64.1-noble@sha256:330d401ae23c905896a0c26c66c36fc971b621519e7b11b435a8328d7bf6e031"
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

# Last, as it shows the popup that the step above has just rendered.
bash scripts/social-preview.sh
