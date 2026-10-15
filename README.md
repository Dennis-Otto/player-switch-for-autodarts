# Player Switch for Autodarts

[![CI](https://github.com/Dennis-Otto/player-switch-for-autodarts/actions/workflows/ci.yml/badge.svg)](https://github.com/Dennis-Otto/player-switch-for-autodarts/actions/workflows/ci.yml)
[![CodeQL](https://github.com/Dennis-Otto/player-switch-for-autodarts/actions/workflows/codeql.yml/badge.svg)](https://github.com/Dennis-Otto/player-switch-for-autodarts/actions/workflows/codeql.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/Dennis-Otto/player-switch-for-autodarts/badge)](https://scorecard.dev/viewer/?uri=github.com/Dennis-Otto/player-switch-for-autodarts)
[![REUSE](https://api.reuse.software/badge/github.com/Dennis-Otto/player-switch-for-autodarts)](https://api.reuse.software/info/github.com/Dennis-Otto/player-switch-for-autodarts)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Sponsor](https://img.shields.io/badge/sponsor-%E2%99%A5-db61a2?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/Dennis-Otto)

A Chrome extension that switches between Autodarts accounts on a shared touch display with one tap, without signing in again.

<sub>💛 If Player Switch for Autodarts is useful to you, you can [support its development](https://github.com/sponsors/Dennis-Otto).</sub>

## Installation

```sh
npm install player-switch-for-autodarts
```

## Development

Every change goes through a pull request whose title follows [Conventional Commits](https://www.conventionalcommits.org/), with signed-off commits (`git commit -s`). The checks of the CI run locally with

```sh
bash scripts/check.sh
```

[CONTRIBUTING.md](CONTRIBUTING.md) explains the set-up and the rules.

## Releases

The release bot keeps a pull request for the next release open, with the version and the changelog from the merged pull requests. Merging it publishes the release, with its SBOM and a signed provenance; [CHANGELOG.md](CHANGELOG.md) lists every change.

## Support and security

Questions and problems: see [SUPPORT.md](SUPPORT.md). Report vulnerabilities privately, as [SECURITY.md](SECURITY.md) describes.

## License

MIT; see [LICENSE](LICENSE). Every file names its license in the machine-readable form of [REUSE](https://reuse.software).
