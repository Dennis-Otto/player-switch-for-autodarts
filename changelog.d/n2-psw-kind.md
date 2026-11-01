### Changed

- The delivery to the Chrome Web Store now comes from the blueprint's workflow, which
  checks the signed provenance of the zip as before. Its summary no longer names the
  sha256 of the zip, and a refusal with `INVALID_ITEM_METADATA` names everything that the
  version asks for, not only what is new since the version in the store.
- A review that begins while a run delivers now fails that run with the answer of the
  store, and the next daily run delivers the release.
- The zip of a release is now compressed, about 110 KB instead of 330 KB, so another
  build of zlib may make other bytes around the same files. A check stops a file of an
  unknown kind before it merges, rather than the build of the release.
