#!/usr/bin/env bash
# Builds the extension and zips it, for the release, the Chrome Web Store, which Edge
# installs from as well, and whoever loads it unpacked; Firefox takes the same zip,
# because the one manifest names what each browser runs (decision 0012). The manifest
# must sit at the root of the zip, so this zips the contents of extension/, not the
# folder.
#
#   bash scripts/package-extension.sh [FOLDER] [VERSION]
#
# writes FOLDER/player-switch-for-autodarts-<version>.zip, dist/ by default, and prints
# its path. The same commit makes the same zip, byte for byte, from a clean checkout:
# the files in their order, each with the time of the commit, forward slashes, and
# stored rather than compressed, as what zlib makes of a file depends on its build. The
# build of a release passes its version through scripts/release-assets.sh, and the
# manifest of a release has that version already, as the release bot writes it there; a
# beta, such as 1.3.0-beta.2, comes from main, whose manifest has the version of the
# last release: its zip gets 1.3.0, as a manifest takes only numbers, and the whole
# version as version_name, which Chrome shows. It needs Node and Python 3.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

out="${1:-dist}"
release="${2:-}"
python="$(command -v python3 || command -v python || command -v py || true)"
if [[ -z "$python" ]]; then
  echo "Python 3 is missing, which writes the zip." >&2
  exit 1
fi

# From nothing, as tsc never removes a file of an earlier build, which would ship.
rm -rf extension/lib
npm run --silent build

# The time of the commit, for every file of the zip; the time of now outside Git.
export SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-$(git log -1 --format=%ct 2>/dev/null || date +%s)}"
"$python" - extension/manifest.json "$out" "$release" <<'PYTHON'
import json
import re
import sys
import time
import zipfile
from os import environ
from pathlib import Path

manifest_path, out, release = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
folder = manifest_path.parent
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
version = manifest["version"]
beta = False
if release:
    numbers = re.match(r"[0-9]+(?:\.[0-9]+)*", release)
    if numbers is None:
        sys.exit(f"{release} is no version of a release.")
    if release != version and numbers.group() == release:
        sys.exit(
            f"{manifest_path.as_posix()} has the version {version}, the release {release}: the"
            " release bot writes the version of a release into the manifest, as"
            " release-please-config.json says."
        )
    beta = release != version
    if beta:
        manifest = {**manifest, "version": numbers.group(), "version_name": release}
else:
    release = version

# Zip files can't hold a time before 1980.
stamp = time.gmtime(max(int(environ["SOURCE_DATE_EPOCH"]), 315532800))[:6]
# The configuration of Biome stays out of the zip, as the source maps do; so does
# shipped() of scripts/check-firefox.mjs.
files = sorted(
    path
    for path in folder.rglob("*")
    if path.is_file() and path.suffix != ".map" and path.name != "biome.jsonc"
)
out.mkdir(parents=True, exist_ok=True)
target = out / f"player-switch-for-autodarts-{release}.zip"
with zipfile.ZipFile(target, "w", zipfile.ZIP_STORED) as archive:
    for path in files:
        entry = zipfile.ZipInfo(path.relative_to(folder).as_posix(), stamp)
        entry.compress_type = zipfile.ZIP_STORED
        entry.external_attr = 0o644 << 16
        # Made by Unix on every system, so that Windows makes the same bytes.
        entry.create_system = 3
        data = path.read_bytes()
        if beta and path == manifest_path:
            data = (json.dumps(manifest, indent=2, ensure_ascii=False) + "\n").encode()
        archive.writestr(entry, data)
print(target.as_posix())
PYTHON
