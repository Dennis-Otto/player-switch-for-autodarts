### Bug fixes

- The end-to-end tests, and the morning checks of what Player Switch relies on at Autodarts and in the next Chrome, no longer run without their network block when Harden-Runner can't start it, as in GitHub's outage of 8 November 2026. Such a job now stops, with the annotation *Harden-Runner doesn't block* that names the cause, instead of reaching every host; running it again is all it takes.
