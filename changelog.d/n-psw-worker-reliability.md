### Bug fixes

- Going back to an older version of the extension no longer wipes the saved
  accounts: the accounts now carry the version of their format, a version that
  doesn't know it leaves them untouched and keeps a copy, and the popup asks you
  to update instead.
- "Manage accounts" shows since when renewing a parked account fails while
  Autodarts can't be reached, such as "Renewal failing since Oct 22, 2026,
  9:15 PM", until a renewal works again, and the extension logs such failures in
  its service worker console instead of hiding them.
