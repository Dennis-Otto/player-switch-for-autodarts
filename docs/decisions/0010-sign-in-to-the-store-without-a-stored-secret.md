# Sign in to the Chrome Web Store with GitHub's OIDC token instead of a stored secret

- Status: accepted
- Date: 2026-10-25

## Context

[Decision 0003](0003-deliver-each-release-to-the-chrome-web-store.md) signs the
workflow in to the Chrome Web Store API with an OAuth client and a refresh token of
the developer account, the secrets `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET` and
`CWS_REFRESH_TOKEN` of the environment `chrome-web-store`. That refresh token can
publish a version of the extension to every user, it never changes by itself, and
whoever copies it can use it from anywhere, for as long as it lives. It also dies on
its own: Google revokes it after six months without use, when the password of the
account changes, or within seven days while the consent screen is in testing, so
[decision 0005](0005-look-after-the-store-every-day-from-a-closed-network.md) signs
in every day to keep it in use.

Version 2 of the Chrome Web Store API, which the workflow uses, takes the access
token of a service account that the Developer Dashboard names under **Account**, one
per publisher. Google Cloud's Workload Identity Federation lets the OIDC token that
GitHub issues to a job stand in for that service account, under a condition that the
provider checks on the claims of the token, such as the repository, the branch and
the workflow.

## Options

1. **Keep the refresh token.** Nothing to set up, but the secret that can publish to
   every user stays, and with it the daily sign-in that keeps it alive.
2. **A key of a service account** as the secret. It doesn't expire after six months,
   but it is a secret again, one that lasts until someone deletes it, which is worse.
3. **Workload Identity Federation with `google-github-actions/auth`.** No stored
   secret, but an action of JavaScript in the job that holds the token that publishes,
   which runs no code of anyone else so far (decision 0005), and a new action for the
   allow list of the repository.
4. **Workload Identity Federation with `curl`.** No stored secret either, and the two
   trades of the token are three requests, which the steps of the workflow make with
   the `curl` and `jq` of the runner, as they already make every other request to
   Google.

## Decision

Option 4, while the refresh token stays the way of a repository that hasn't set up
the federation yet.

- With the variables `CWS_WORKLOAD_IDENTITY_PROVIDER` and `CWS_SERVICE_ACCOUNT` set,
  the jobs _status_ and _store_ ask GitHub for an OIDC token of the job, trade it at
  Google's Security Token Service for a federated token, and trade that at the IAM
  Service Account Credentials API for an access token of the service account with the
  scope `chromewebstore`, which lasts 20 minutes, longer than either job may run.
  Without the variables, they sign in with the refresh token, as before. Half the
  set-up, or a variable that has the wrong form, fails the check of the set-up with
  what to set; a secret that the sign-in no longer needs is a warning in every run
  until someone deletes it.
- The condition of the provider admits the OIDC token only of this repository, by its
  ID, which a new repository of the same name doesn't get, of the branch `main` and of
  the workflow `publish-store.yml`. So the other workflows on `main` whose jobs may ask
  GitHub for an OIDC token, those of the release, the website and Scorecard, which sign
  their provenance or results with it, can't trade one, and neither can a branch or a
  fork. The pool may act as the service account,
  which has no role in the project; the Developer Dashboard admits it to the item.
- Only the two jobs that talk to the store have `id-token: write`; the job _package_,
  which runs `npm ci` and the build, can't ask for an OIDC token, and
  `test/publish-store.test.ts` fails when that changes. The sign-in is the same step in
  both jobs, which the test keeps so, and runs against a fake `curl` in the test for
  every answer of GitHub and Google that it handles.
- The two jobs reach `sts.googleapis.com` and `iamcredentials.googleapis.com` beside
  the hosts that they reached before.

## Consequences

- Once the federation is set up and the three secrets are deleted, no secret can
  publish the extension. What could is an OIDC token of a run of this workflow on
  `main`, which lasts minutes, and the access token traded for it, which lasts 20.
- Nothing expires any more: the daily run still looks after the store, but no longer
  has to keep a token alive.
- Someone has to set the federation up once, in Google Cloud and in the Developer
  Dashboard, as [the releases page](../releases.md#sign-in-without-a-stored-secret)
  describes, then delete the secrets and remove them from
  `.github/repository.project.toml`. Until then, the workflow works as before.
- Moving the repository to another owner, or renaming it or the workflow, changes the
  claims that the condition checks: the sign-in fails, with the reason in the run,
  until the condition of the provider is changed with it.
