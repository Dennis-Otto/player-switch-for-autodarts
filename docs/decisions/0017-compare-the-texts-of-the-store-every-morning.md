# Compare the texts of the store with store/ every morning

- Status: accepted
- Date: 2026-11-12

## Context

The short and the detailed description of the Chrome Web Store come from
`store/listing.<code>.md`, in five languages. The workflow of the store delivers each
release by itself ([decision 0014](0014-take-the-chrome-extension-kind-of-the-blueprint.md)),
but the API of the store can't set the texts of a listing: they reach the store only by
a paste into the Developer Dashboard. Nothing compared the two, and in November 2026 the
store still showed the detailed description of the first release in English and German,
without the switcher on the board display, the question during a match, the seat in the
lobby, the venue mode or the sign-out on removal, and with a claim about accounts of
Google and Apple that the files had corrected weeks before (#229).

## Options

1. **Set the texts by API.** The Chrome Web Store API v2 uploads and publishes a
   package and tells its status; it has no call for the texts of a listing.
2. **A checklist of the release.** A line in the guide of the releases that asks for
   the paste. It was there in spirit, and the texts still fell behind: nothing tells
   when a paste was forgotten.
3. **Compare the public page every morning.** The page of the item in each language is
   public and shows both descriptions. A job of the workflow Upstream, which runs every
   morning already ([decision 0009](0009-watch-autodarts-and-the-next-chrome-before-the-players-do.md)),
   reads it, with no secret and one request for each language, and fails when a text
   differs from its file.

## Decision

Option 3, in `scripts/store-listing.ts` and the job `store-listing`. Both texts are
reduced to plain text with the whitespace collapsed, so the line breaks of a file don't
count. Two waits that the store imposes don't count as a difference: the check compares
only while the store publishes the latest release, the version of
`extension/manifest.json`, as a release in review may come with new texts; and a file
whose descriptions changed in the last 7 days, by the history of git, may still differ,
as the store reviews a pasted text too, for as long as `store-status.mjs` gives the
review of a release. A change of another section of the file, such as the
justifications, doesn't start the 7 days again. In a pull request a text that differs
is a warning, as a pull request can't change the store.

## Consequences

- A forgotten paste turns the morning run red after at most 7 days, and the bot-health
  bot keeps an issue open until the store shows the text.
- The check reads the HTML of the store, which Google may change: the short description
  is the description in the metadata of the page, the detailed one the paragraph right
  after it in the Overview, and the version comes from the page in English. A page that
  answers without them fails the check with that reason, and `readPage` learns the new
  form.
- The job checks out the whole history, which a shallow clone lacks.
- The paste itself stays a step for a person, which [the guide of the releases](../releases.md#the-texts-of-the-store)
  describes.
