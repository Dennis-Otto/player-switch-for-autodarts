# Player Switch for Autodarts

A Chrome extension that switches between Autodarts accounts on a shared touch
display with one tap, without signing in again. Everyone in the house plays under
their own account; a tap on a tile puts that account on the board.

The account that steps aside is not signed out at Autodarts — its session is parked
so a tap brings it straight back, and the extension keeps parked sessions fresh in
the background. An optional "remember password" signs an account back in by itself
if its session ever stops working.

- **Get started:** the [README](https://github.com/Dennis-Otto/player-switch-for-autodarts#readme)
  explains how to install the extension unpacked.
- **How and why it works this way:** see
  [the decision record](decisions/0002-swap-the-session-not-the-login.md).
- **What it stores and the risks:** see [the security design](security.md).

This is a prototype, and it relies on an interface Autodarts does not publish, so a
change on their side can stop it working until the extension is adjusted.
