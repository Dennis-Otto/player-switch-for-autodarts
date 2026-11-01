# Decisions

The decisions that shape this project, each with its reasons, so that a later change can see why things are as they are. A decision that changes an earlier one gets a new record, and the earlier one says which record replaces it.

Copy [the template](0000-template.md) to the next free number and describe the decision in the pull request that makes it.

| Record | Decision | Status |
| --- | --- | --- |
| [0001](0001-record-decisions.md) | Record the decisions that shape the project | accepted |
| [0002](0002-swap-the-session-not-the-login.md) | Switch accounts by swapping the stored session | accepted |
| [0003](0003-deliver-each-release-to-the-chrome-web-store.md) | Deliver each release to the Chrome Web Store from the release workflow | accepted, extended by 0005, 0010 and 0013 |
| [0004](0004-save-a-new-sign-in-only-in-a-window.md) | Save a new sign-in by itself only in a window after "Add account" | accepted |
| [0005](0005-look-after-the-store-every-day-from-a-closed-network.md) | Look after the store every day, from jobs with a closed network | accepted, extended by 0013 |
| [0006](0006-seal-the-secrets-with-a-key-that-never-leaves-the-browser.md) | Seal the saved sessions and passwords with a key that never leaves the browser | accepted |
| [0007](0007-test-the-real-extension-against-a-fake-autodarts.md) | Test the real extension in Chromium against a fake Autodarts | accepted, extended by 0009 |
| [0008](0008-lock-a-venue-display-with-pins-that-the-worker-checks.md) | Lock a venue display with PINs that the service worker checks | accepted |
| [0009](0009-watch-autodarts-and-the-next-chrome-before-the-players-do.md) | Watch Autodarts and the next Chrome before the players do | accepted |
| [0010](0010-sign-in-to-the-store-without-a-stored-secret.md) | Sign in to the Chrome Web Store with GitHub's OIDC token instead of a stored secret | accepted |
| [0011](0011-write-every-line-that-ships-in-typescript.md) | Write every line that ships in TypeScript, the service worker and the content script too | accepted |
| [0012](0012-run-one-package-in-chrome-edge-and-firefox.md) | Run one package in Chrome, Edge and Firefox | accepted |
| [0013](0013-ship-the-zip-with-the-release-and-deliver-exactly-that-one.md) | Ship a reproducible zip with every release, and deliver exactly that one to the store | accepted |
