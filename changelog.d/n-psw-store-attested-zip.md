### Features

- Each delivery to the Chrome Web Store now names the sha256 of the zip that it uploaded,
  and checks those bytes against the zip of the release before it signs in, so you can
  compare what went to the store with a download or a build of your own.
- The zip of a release holds only the kinds of file that the extension loads, and a build
  stops at any other. Two builds of one commit, in different time zones, are compared byte
  for byte before every merge.
