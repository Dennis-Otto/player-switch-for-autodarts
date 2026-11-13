### Bug fixes

- A refusal of the sign-in service in the old form `invalid_grant`, which Autodarts no longer sends, keeps the parked sessions and shows the hint that Autodarts may have changed how it signs in, instead of ending them, and **Remove account** no longer takes such an answer for the end of the session.

### Changed

- Player Switch needs Firefox 153 or newer now, such as Firefox 153 ESR: Mozilla no longer supports Firefox 140 ESR, whose computers have moved to 153 ESR by themselves. Every morning, the tests run in Firefox 153 ESR and Chrome 140, the oldest versions that the extension allows, and in the next Firefox, so a change that a display on an older browser can't run shows before a release.
