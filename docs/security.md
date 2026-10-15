# Security design

<!-- The blueprint wrote this page once; from now on it belongs to the project. Keep it true to the software: what it protects, what it trusts, the threats and how the code counters them, and what remains. -->

What Player Switch for Autodarts protects, what it trusts and which risks remain. [SECURITY.md](https://github.com/Dennis-Otto/player-switch-for-autodarts/blob/main/SECURITY.md) says how to report a vulnerability and how to verify a release, and argues why the repository and its releases are safe.

## What you can expect

- Every public function checks its arguments and rejects invalid ones with an error, instead of guessing.
- The package never runs its input as code and opens no network connection or file that its documentation doesn't name.
- It has no secrets of its own; credentials that a caller passes in are never logged.

## Trust boundaries

1. **Caller → package.** Every argument of a public function is untrusted input.
2. **Package → files and network.** Only those the caller names.

## Threats and countermeasures

| Threat | Countermeasure |
| --- | --- |
| Invalid input leads to wrong results | Every public function rejects it with an error |
| Input runs as code | The package evaluates no input |

## Residual risks

- The package is as safe as the program that uses it and the arguments that this program passes in.
