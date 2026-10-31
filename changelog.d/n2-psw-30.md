### Bug fixes

- A session that someone signed in with directly on the Autodarts page, without the
  popup, no longer ends up under the tile of the player before. A tap on a tile or **Add
  account** now asks Autodarts whose session is in the page and parks it with that
  player, and the player who was signed out shows that they need a new sign-in. A
  session of an account without a tile isn't saved. Because this takes an answer from
  Autodarts, **Add account** and the return after a break of the venue mode now wait
  while Autodarts can't be reached, and the page stays as it is until then.
