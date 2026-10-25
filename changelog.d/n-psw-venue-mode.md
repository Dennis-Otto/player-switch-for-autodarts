### Features

- A venue mode for a display in a club or a pub, off until you turn it on under
  Settings → For a club or pub:
  - A manager PIN guards Manage accounts and the settings, so nobody at the display
    removes an account or remembers a password without it.
  - Each player can protect their account with a PIN of 4 to 8 digits. A tap on their
    tile asks for it on a number pad that works on a touch screen, in the popup and on
    the Autodarts page, and their tile shows a lock. Five wrong PINs in a row make
    every PIN wait a minute.
  - After a break of 5 to 60 minutes without a tap, a click or a key on the Autodarts
    page, the display returns to a house account of your choice, or signs out, so the
    next games don't count for the player who left. A match is never interrupted: the
    break starts once it has ended, and the player before keeps their session parked.
- The extension keeps no PIN, only a salted hash of it. A PIN is a lock for the people
  at the display, not a protection against someone who can use the computer; the
  guide for a shared display shows what to do about a forgotten manager PIN.
