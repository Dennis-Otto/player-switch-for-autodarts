### Features

- The zip of a release holds only the kinds of file that the extension loads, and a check
  stops any other before it merges. Two builds of one commit, in different time zones, are
  compared byte for byte before every merge.
