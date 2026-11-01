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
# version as version_name, which Chrome shows. It holds only the kinds of file below, and
# stops at any other, so that nothing new reaches the users unnoticed. It needs Node and
# Python 3.
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

# What a package holds, by the path in extension/: all that the extension loads. A file
# of another kind stops the build; its kind goes into SHIPS when the extension needs it,
# and into STAYS_OUT when it doesn't.
SHIPS = re.compile(
    r"manifest\.json"
    r"|_locales/[A-Za-z_]+/messages\.json"
    r"|icons/[a-z0-9-]+\.png"
    r"|[a-z]+\.(?:html|css)"
    r"|lib/(?:[a-z0-9-]+/)*[a-z0-9-]+\.js"
)
# The configuration of Biome and the source maps, as in shipped() of
# scripts/check-firefox.mjs.
STAYS_OUT = re.compile(r"biome\.jsonc|.*\.map")
paths = sorted(
    path.relative_to(folder).as_posix() for path in folder.rglob("*") if path.is_file()
)
strange = [p for p in paths if not SHIPS.fullmatch(p) and not STAYS_OUT.fullmatch(p)]
if strange:
    sys.exit(
        f"extension/ holds {', '.join(strange)}, of no kind that the package knows: add the"
        " kind to SHIPS in scripts/package-extension.sh when the extension needs it, or to"
        " STAYS_OUT when it doesn't."
    )
shipped = [p for p in paths if SHIPS.fullmatch(p)]
# Each file that the manifest names, as a browser refuses a package without it.
background = manifest.get("background", {})
named = [
    manifest.get("action", {}).get("default_popup"),
    manifest.get("options_ui", {}).get("page"),
    background.get("service_worker"),
    *background.get("scripts", []),
    *manifest.get("icons", {}).values(),
    *(p for s in manifest.get("content_scripts", []) for p in s.get("js", []) + s.get("css", [])),
    *(p for e in manifest.get("web_accessible_resources", []) for p in e.get("resources", [])),
]
missing = sorted({p for p in named if p is not None} - set(shipped))
if missing:
    sys.exit(f"The manifest names {', '.join(missing)}, which the package lacks.")

# Zip files can't hold a time before 1980.
stamp = time.gmtime(max(int(environ["SOURCE_DATE_EPOCH"]), 315532800))[:6]
out.mkdir(parents=True, exist_ok=True)
target = out / f"player-switch-for-autodarts-{release}.zip"
with zipfile.ZipFile(target, "w", zipfile.ZIP_STORED) as archive:
    for name in shipped:
        path = folder / name
        entry = zipfile.ZipInfo(name, stamp)
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
