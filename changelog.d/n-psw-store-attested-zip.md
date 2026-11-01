### Features

- Every new release carries the zip of the extension,
  `player-switch-for-autodarts-<version>.zip`, with its signed provenance: load it
  unpacked in Chrome or Edge, and check with `gh attestation verify` that it comes from
  the build of the release. The README says how.
- The Chrome Web Store now gets exactly that zip, and its run names the sha256 that it
  uploaded. A zip without a valid provenance goes nowhere.
- The same commit always makes the same zip, byte for byte, on Linux and on Windows, so
  anybody can build it from the source of a release and compare it. It holds only the
  kinds of file that the extension loads.
