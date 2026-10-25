# Seal the saved sessions and passwords with a key that never leaves the browser

- Status: accepted
- Date: 2026-10-25

## Context

The extension keeps a refresh token of Autodarts for every saved account and, where a
person asked for it, a username and a password. Until now they sat in plain text in
`chrome.storage.local`. Only the extension's own contexts may read that storage
(`TRUSTED_CONTEXTS`, see the security design), but the values also sit unencrypted in
the LevelDB of the browser profile on the disk. Every tool that dumps the storage of an
extension shows them, and so does a backup or a copy of the profile. A token of
Autodarts works for weeks, and a password works everywhere it is reused.

A browser extension has no secret of its own that the profile doesn't hold as well, and
Chrome has no API for the keychain of the operating system. So no design can keep the
secrets from someone who can read the whole profile with the same account of the
operating system. A design can still raise the bar for everything that sees only the
storage of the extension.

## Options

1. **Keep plain text, and rely on the access level of the storage.** This is the
   simplest, but every dump, backup or copy of the storage shows each secret.
2. **Encrypt with a key derived from a PIN or a passphrase.** Without the passphrase,
   no copy of the profile opens anything. But a shared display would have to ask
   for it at every start of the browser, and a board in kiosk mode, which nobody
   touches between matches, couldn't renew a parked session by itself. That defeats
   the purpose of the extension.
3. **Encrypt with a key that the browser keeps for the extension and never hands
   out.** WebCrypto makes an AES-GCM key that can't be exported, and the service
   worker keeps it in the IndexedDB of the extension's origin. The browser uses the
   key for the extension, but no script ever reads its bytes, and neither a content
   script nor a page of another origin reaches that database. The storage then holds
   only sealed text.

## Decision

Option 3. It needs no step from the people at the display and works on a board in kiosk
mode. It takes the secrets out of every place that reads only `chrome.storage.local`.

- `src/vault.ts` seals each secret with AES-GCM, with a random nonce of 12 bytes. Its
  place, `token/<id>` or `credentials/<id>`, is the additional data, so a value moved
  to another account doesn't open. The key store writes a key only where none is stored
  yet, so a key that sealed the accounts is never replaced. The extension asks for
  `unlimitedStorage`, which shows no warning, so that Chrome never evicts that
  IndexedDB when the disk runs low, as it may do with the web storage of an extension
  without it; `navigator.storage.persist()` is not available in a service worker.
- The stored format becomes version 2: `token` and `credentials` are `{ iv, data }`,
  and the rest stays plain, so the button in the page can show the player without
  opening a secret. Version 1 is the plain text of the versions before. The store seals
  it at the first reading and on the update. A version that doesn't know version 2
  never saves over it, which decision 0002's rotation of tokens requires anyway (see
  the section "The saved accounts keep their format" of the development guide).
- A secret that doesn't open, because the key is gone or the value was changed,
  degrades the account: a lost session means it has to sign in again, and a lost
  password is forgotten. Nothing fails, and nothing is saved in plain text instead.
  A key store that can't be read fails the request, so that a passing fault never
  costs a session.

The service worker already takes requests that see or change the accounts only from the
extension's own pages, and keeps the storage from the content scripts. Those rules stay
as they are.

## Consequences

- No token and no password is left in plain text in the storage after the update; the
  security design describes the threats it stops and the risk that remains: someone
  with the account of the operating system can read the key as well.
- Clearing the data of the extension, which deletes its IndexedDB, now costs every
  parked account one sign-in, and the remembered passwords. The help says so.
- Versions up to 0.2.0 don't know the sealed format and would drop the saved sessions,
  so don't go back to them. From this release on, an older version leaves newer
  accounts alone, keeps a copy and asks for an update.
- A later change of the cipher or of the key is a new version of the format, with a
  migration in `storage.ts`. The key store can hold another key beside this one, under
  a name of its own.
