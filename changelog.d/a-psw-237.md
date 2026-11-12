### Bug fixes

- **Remember password** checks the username and the password with Autodarts as it saves them. A typo, or the sign-in of another player, now shows at once with a message, and the form opens again with the username, instead of weeks later, when the session has ended and the tile says **Sign in again** although a password is remembered. When Autodarts takes them, the account gets a fresh session right away, so a tile that had to sign in again is ready to play.
- A remembered sign-in that belongs to another account than its tile no longer brings that other player onto the page or into a lobby under the wrong tile, and no longer ends that player's session on the next renewal: the extension ends such a session at once, and the tile says **Sign in again**. The help says why.
