### Bug fixes

- When the Chrome Web Store takes a new version but refuses to submit it because its
  Developer Dashboard lacks something (`INVALID_ITEM_METADATA`), the run of the store
  workflow now says so, in its summary and in an annotation: it names the permissions,
  hosts, web-accessible pages and languages that the release asks for, and says where
  the justifications are and how to submit the version again.
