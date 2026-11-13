# Keep a ring of events without personal data for bug reports

- Status: accepted
- Date: 2026-11-13

## Context

The bug form asks for "Logs", but the extension kept none. Its only trace of a failure
was a line in the console of the service worker, which only someone who knows the way
through `chrome://extensions` sees, and which is gone once the worker has stopped. A
report from a kiosk display therefore carried two version numbers and nothing else, and
"Something went wrong" couldn't be diagnosed at all. The extension relies on an
interface of Autodarts that isn't official, so reports from the field are the second
line of defence after the workflow Upstream
([decision 0009](0009-watch-autodarts-and-the-next-chrome-before-the-players-do.md)).

The extension keeps sessions and passwords, and a display is shared by people who
needn't know each other's accounts. Whatever it notes for a report must not carry
any of that, nor who played when.

## Options

1. **The console alone, with a help that says how to open it.** Nothing new is kept,
   but the trace is gone with the worker, and few players at a display find it.
2. **A log of free texts, such as the messages of the errors.** Easy to write and to
   read, but a message of an error or of Autodarts can name an account, an address or
   a lobby, and nothing would keep a token out of it for good.
3. **A ring of the last 50 events with closed fields:** the time, a kind of action from
   a closed list, a word of the code for the outcome, the HTTP status of a request
   that failed and the counts of a renewal. A request names only the service of
   Autodarts it went to, an error only its kind. Reading the ring drops every other
   field. **Copy diagnostics** in **Manage accounts** puts it on the clipboard with how
   each account stands, by its number, never its name.

## Decision

Option 3. `src/diagnostics.ts` keeps the ring in `chrome.storage.local` under
`diagnostics`, which only the service worker and the pages of the extension read, and
the worker notes each request of the popup as it ends, each renewal, each request of
its fetcher that failed and each failure that it logs; a question, such as for a PIN,
and a view that worked are no events. The ring is written one change at a time and
never fails a request. **Forget all accounts** deletes it with everything else. The
copy goes only to the clipboard, when a person chooses it, behind the manager PIN in
the venue mode, and the bug form and the help say what it holds.

## Consequences

- A report can say what failed and when, with the HTTP status, without a round of
  questions to a person at a kiosk display.
- A test runs sign-ins, switches and renewals with real-looking names and passwords
  and finds none of them, no token and no address in the ring; another one in the
  real extension does the same for the copy.
- An event that would need more than a word of the code, such as the text of an
  error of Autodarts, isn't noted. A developer still sees it in the console of the
  service worker, which the help explains.
- The privacy policy and the security design list the ring among what the extension
  keeps.
