#!/usr/bin/env bash
# Renders the pictures inside the Playwright image, for scripts/screenshots.sh, which
# mounts the repository read-only at /work: it installs the font and the tools, runs
# capture.py and writes the pictures as a tar archive to stdout, so that they belong
# to whoever runs the script. Everything else goes to stderr.
set -euo pipefail
exec 3>&1 1>&2

# Inter, the font of the pictures: the exact package of Ubuntu 24.04, the system of
# the image, checked against its SHA-256. Launchpad keeps every published package at
# its address.
FONT_PACKAGE="fonts-inter_4.0+ds-1_all.deb"
FONT_SHA256="d1ca9cc3e26c347bd31977d4693bf6c371ee6b81a711e092923c8160c02e88ce"

work="$(mktemp -d)"
curl --fail --silent --show-error --location --retry 3 --output "$work/$FONT_PACKAGE" \
  "https://launchpad.net/ubuntu/+archive/primary/+files/${FONT_PACKAGE//+/%2B}"
echo "$FONT_SHA256  $work/$FONT_PACKAGE" | sha256sum --check --strict --quiet
dpkg-deb --extract "$work/$FONT_PACKAGE" "$work/font"
mkdir -p /usr/local/share/fonts/inter
cp "$work"/font/usr/share/fonts/opentype/inter/Inter-*.otf /usr/local/share/fonts/inter/
cp test/harness/fonts.conf /etc/fonts/local.conf
fc-cache --force >/dev/null

python3 -m pip install --quiet --disable-pip-version-check --root-user-action=ignore \
  --break-system-packages --no-cache-dir --require-hashes -r test/harness/requirements.txt

out="$work/pictures"
PYTHONDONTWRITEBYTECODE=1 python3 test/harness/capture.py "$out"
tar --create --directory "$out" --file - . >&3
