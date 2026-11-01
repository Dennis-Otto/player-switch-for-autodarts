### Bug fixes

- When the Chrome Web Store takes a new version but refuses to submit it because its
  Developer Dashboard lacks something (`INVALID_ITEM_METADATA`), the run of the store
  workflow now says so, in its summary and in an annotation: it names the permissions,
  hosts, web-accessible pages and languages that the release asks for beyond the version
  in the store, links the item in the dashboard, and says where the justifications are
  and how to submit the version again.
- A review that begins while a run is delivering, such as after a click on **Submit for
  review** in the dashboard, no longer fails the run: it ends with a note, as it does
  for any review, and a later day delivers the release.
