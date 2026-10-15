# Switch accounts by swapping the stored session

- Status: accepted
- Date: 2026-10-15

## Context

Autodarts Play keeps the signed-in session as a single rotating refresh token in
the browser's `localStorage` (key `autodarts_refresh_token`); the access token
lives only in memory and lasts 15 minutes. A shared display in the house should let
several people play under their own account and switch with one tap, without typing
a password each time. There is no official Autodarts interface for this.

## Options

1. **Swap the stored session.** Keep each account's refresh token and write the
   chosen one into the page's `localStorage`, then reload.
2. **Sign in each time.** Store each account's password and call the sign-in
   endpoint on every switch.
3. **One Chrome profile per person.** Let the browser hold separate sessions and
   switch profiles.

## Decision

Option 1. It needs no password for the common case, works with every way of signing
in (password, e-mail code, Google, Apple), and a tap is enough. The account that
steps aside is deliberately **not** signed out at Autodarts, so its session stays
valid and a tap brings it back; "switching away" only removes it from the page.

Because the refresh token rotates on every renewal, the extension always keeps the
token the server last returned and renews parked tokens in the background, so a
parked account still works days later.

Option 2 is kept as an **optional fallback**: if the user lets the extension
remember an account's password, it signs that account in again automatically when
its token stops working. This does not cover Google or Apple accounts. Option 3 was
rejected as awkward at a touch display, with a separate window per person.

## Consequences

- The extension depends on an interface Autodarts does not publish; a change there
  can require an adjustment, and the lifetime of a parked token is not guaranteed.
- A stored token, and an optional stored password, sit in `chrome.storage.local` on
  a trusted shared computer; see [the security design](../security.md).
- Only `extension/content.js` touches the page's stored session, which keeps the
  sensitive surface to one small, clearly marked file.
