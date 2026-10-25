#!/usr/bin/env bash
# A curl for test/publish-store.test.ts, which puts it first on the PATH of a step of
# .github/workflows/publish-store.yml: it records each call in the file FAKE_CALLS, the
# address, --get, and each header and field of data with the content of a file that
# it names, and answers as the service of the address: FAKE_<SERVICE>_ANSWER into the
# file of --output, and FAKE_<SERVICE>_EXIT as its exit code, where the service is STS,
# IAM or else OIDC, the token service of GitHub.
set -euo pipefail
out="" url=""
{
  echo call
  while (($#)); do
    case "$1" in
      --output)
        out="$2"
        shift
        ;;
      --get) echo get ;;
      --header | --data | --data-urlencode)
        value="$2"
        if [[ "$1" == --header && "$value" == @* ]]; then
          value="$(cat "${value#@}")"
        elif [[ "$1" == --data-urlencode && "$value" =~ ^([a-z_]+)@(.+)$ ]]; then
          # curl sends the whole file, a line break at its end too, so the record
          # shows each line break as \n.
          name="${BASH_REMATCH[1]}"
          content="$(cat "${BASH_REMATCH[2]}" && echo .)"
          content="${content%.}"
          value="$name=${content//$'\n'/\\n}"
        fi
        printf '%s %s\n' "$1" "$value"
        shift
        ;;
      https://*)
        url="$1"
        echo "url $1"
        ;;
    esac
    shift
  done
} >>"$FAKE_CALLS"
case "$url" in
  https://sts.googleapis.com/*) service=STS ;;
  https://iamcredentials.googleapis.com/*) service=IAM ;;
  *) service=OIDC ;;
esac
answer="FAKE_${service}_ANSWER" code="FAKE_${service}_EXIT"
printf '%s' "${!answer:-}" >"$out"
exit "${!code:-0}"
