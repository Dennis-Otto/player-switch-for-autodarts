### Bug fixes

- The saved accounts, with their sessions and remembered passwords, are now out of
  reach of the script that the extension runs in the Autodarts page: only the
  extension's own popup, options page, switcher and background service can read
  them, so even a page that went rogue can't get at them through that script.
- The extension now lets the browser block every connection except to Autodarts'
  sign-in service, takes requests to see or switch accounts only from its own
  pages, and writes nothing but a session into the Autodarts page.
- The extension no longer asks for access to `play.autodarts.io`, which only
  forwards to `play.autodarts.com`. It now needs Chrome 140 or newer, so an older
  browser no longer installs a version that can't run, and `chrome://extensions`
  links its website.
