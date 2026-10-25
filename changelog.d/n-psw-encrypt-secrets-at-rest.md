### Features

- The saved sessions and remembered passwords are now stored encrypted. The key stays
  in the browser, which never hands it out, not even to the extension, so a tool, a
  backup or a copy that reads the extension's storage finds no session and no
  password in it. The update encrypts the accounts that are already saved, and every
  player stays signed in.
- If the key is ever lost, for example because the data of the extension was
  cleared, the parked accounts ask to sign in again once, and remembered passwords
  are forgotten. Nothing else breaks.
- The update asks for the permission `unlimitedStorage`, which shows no warning, so
  that Chrome never deletes the key when the disk runs low.
- Versions up to 0.2.0 don't know the encrypted format, so don't go back to them: they
  would drop the saved sessions. From this release on, an older version leaves newer
  accounts untouched and asks for an update.
