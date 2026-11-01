#!/usr/bin/env bash
# A GitHub CLI for test/publish-store.test.ts, which puts it first on the PATH of a step
# of .github/workflows/publish-store.yml: it records each call in the file FAKE_GH_CALLS.
# `gh release download TAG --pattern P --dir D` copies the files of the folder
# FAKE_RELEASE into D, and fails as gh does when that folder holds none or
# FAKE_DOWNLOAD_EXIT says so. `gh attestation verify` answers with FAKE_ATTESTATION_EXIT.
set -euo pipefail
echo "$*" >> "$FAKE_GH_CALLS"
case "$1 $2" in
  "release download")
    dir=""
    while (($#)); do
      if [[ "$1" == --dir ]]; then
        dir="$2"
      fi
      shift
    done
    [[ "${FAKE_DOWNLOAD_EXIT:-0}" == 0 ]] || exit "$FAKE_DOWNLOAD_EXIT"
    shopt -s nullglob
    files=("$FAKE_RELEASE"/*)
    if ((${#files[@]} == 0)); then
      echo "no assets to download" >&2
      exit 1
    fi
    cp "${files[@]}" "$dir"
    ;;
  "attestation verify")
    if [[ "${FAKE_ATTESTATION_EXIT:-0}" != 0 ]]; then
      echo "Error: verifying with issuer \"sigstore.dev\": no matching attestation" >&2
      exit "$FAKE_ATTESTATION_EXIT"
    fi
    echo "Verification succeeded!"
    ;;
  *)
    echo "The fake gh knows no \"$1 $2\"." >&2
    exit 2
    ;;
esac
