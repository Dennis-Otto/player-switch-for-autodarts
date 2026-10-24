# Notes of this project for coding agents

Player Switch for Autodarts: Chrome extension for a shared Autodarts display: everyone plays under their own account and a tap on a tile switches players. Sessions are parked and kept fresh, so nobody signs in again; an optional remembered password signs an account back in by itself. Everything stays on the computer.

This file belongs to the project: the blueprint wrote it once, and its updates leave it alone. It adds to `AGENTS.md` what a coding agent needs to know about this project alone, such as its architecture, the commands of its own checks and what to watch for in its tests.

## Where things are

- The package is in `src/`, its metadata and version in `package.json`.
- `README.md` documents installation, configuration and use, `docs/` holds the pages of the website, and `CHANGELOG.md` lists the changes of every release.
- The tests are in `test/`; `scripts/check.sh` runs every check.
- The pictures of the extension in the README, on the website and in the store (`docs/images/*.png`, `*.gif` beside the diagrams, and `store/images/`) come from `bash scripts/screenshots.sh`, with Docker: `test/harness/` shows the real popup and switcher with a stand-in for Chrome and made-up accounts. Never edit a picture by hand; change the extension or the harness and render again, or leave it to the screenshot bot. [docs/development.md](../docs/development.md#pictures) has the details.
