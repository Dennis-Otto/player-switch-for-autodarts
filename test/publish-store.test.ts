// Tests how .github/workflows/publish-store.yml signs in to the Chrome Web Store
// (decision 0010): the check of its set-up chooses between the refresh token and the
// sign-in without a stored secret, only the two jobs that talk to the store may ask
// GitHub for an OIDC token, the sign-in without a secret is the same in both, and it
// runs against a fake curl that answers as GitHub and Google do. The delivery runs
// against the same curl: what it says when the store refuses a submission, and that a
// review that began in the meantime is no failure. The steps run in bash with jq, as
// on the runner; on a computer without them those tests skip, other than in the CI.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { readWorkflow } from "./workflow.ts";

const { text: WORKFLOW, jobLines, step } = readWorkflow("publish-store.yml");

const SETUP = "Check the set-up of the environment";
const REFRESH = "Sign in to the Chrome Web Store API with the refresh token";
const KEYLESS = "Sign in to the Chrome Web Store API with GitHub's OIDC token";
const ASKS = "Find what the release asks for beyond the version of the store";
const DELIVER = "Upload the zip and submit it for review";

const PROVIDER =
  "projects/123456789/locations/global/workloadIdentityPools/github/providers/player-switch";
const SERVICE_ACCOUNT = "chrome-web-store@a-project.iam.gserviceaccount.com";
const OIDC_URL = "https://token.actions.example/idtoken?api-version=2.0";

/** bash and jq, which the steps need. */
const tools =
  spawnSync("bash", ["-c", "command -v jq"], { encoding: "utf8" }).status === 0;
const skip =
  tools || process.env.CI
    ? false
    : "No bash with jq here: the runs of the sign-in skip; the CI runs them.";

/** A curl that records each call and answers as the service of its address. */
const FAKE_CURL = readFileSync(
  fileURLToPath(new URL("fake-curl.sh", import.meta.url)),
  "utf8",
);

/** A call of the fake curl. */
interface Call {
  readonly url: string | undefined;
  readonly get: boolean;
  readonly headers: readonly string[];
  readonly data: readonly string[];
}

const parseCalls = (text: string): Call[] =>
  text
    .split(/^call\n/m)
    .slice(1)
    .map((block) => {
      const lines = block.split("\n").filter((line) => line !== "");
      const values = (flag: string): string[] =>
        lines
          .filter((line) => line.startsWith(`${flag} `))
          .map((line) => line.slice(flag.length + 1));
      return {
        url: values("url")[0],
        get: lines.includes("get"),
        headers: values("--header"),
        data: [...values("--data-urlencode"), ...values("--data")],
      };
    });

/** What a step left behind. */
interface Result {
  readonly status: number | null;
  readonly stdout: string;
  readonly summary: string;
  readonly output: string;
  readonly calls: Call[];
  /** The files in RUNNER_TEMP after the step. */
  readonly files: string[];
  readonly authorization: string | undefined;
}

/** Runs a script of the workflow as the runner does, in bash -e, with a fake curl. */
const runStep = (
  script: string,
  env: Readonly<Record<string, string>>,
): Result => {
  const dir = mkdtempSync(join(tmpdir(), "publish-store-"));
  try {
    const bin = join(dir, "bin");
    const temp = join(dir, "temp");
    mkdirSync(bin);
    mkdirSync(temp);
    writeFileSync(join(bin, "curl"), FAKE_CURL);
    chmodSync(join(bin, "curl"), 0o755);
    // No test waits for the store to go on processing an upload.
    writeFileSync(join(bin, "sleep"), "#!/usr/bin/env bash\n");
    chmodSync(join(bin, "sleep"), 0o755);
    writeFileSync(join(dir, "step.sh"), script);
    const files = {
      summary: join(dir, "summary.md"),
      output: join(dir, "output"),
      calls: join(dir, "calls"),
    };
    for (const file of Object.values(files)) {
      writeFileSync(file, "");
    }
    const result = spawnSync(
      "bash",
      ["--noprofile", "--norc", "-e", join(dir, "step.sh")],
      {
        encoding: "utf8",
        env: {
          PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
          RUNNER_TEMP: temp,
          GITHUB_STEP_SUMMARY: files.summary,
          GITHUB_OUTPUT: files.output,
          FAKE_CALLS: files.calls,
          ...env,
        },
      },
    );
    const authorization = join(temp, "authorization");
    return {
      status: result.status,
      stdout: result.stdout,
      summary: readFileSync(files.summary, "utf8"),
      output: readFileSync(files.output, "utf8"),
      calls: parseCalls(readFileSync(files.calls, "utf8")),
      files: readdirSync(temp),
      authorization: existsSync(authorization)
        ? readFileSync(authorization, "utf8")
        : undefined,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

describe("the jobs of the store", () => {
  test("only the two that talk to the store may ask GitHub for an OIDC token", () => {
    assert.match(WORKFLOW, /^permissions: \{\}$/m);
    const grants = (job: string): number =>
      jobLines(job).filter((line) => line === "      id-token: write").length;
    assert.equal(grants("status"), 1);
    assert.equal(grants("store"), 1);
    assert.equal(grants("package"), 0);
    assert.equal(WORKFLOW.match(/id-token: write$/gm)?.length, 2);
  });

  test("the two that sign in reach the hosts of Google that trade the OIDC token", () => {
    for (const job of ["status", "store"]) {
      const lines = jobLines(job);
      for (const host of [
        "sts.googleapis.com:443",
        "iamcredentials.googleapis.com:443",
      ]) {
        assert.ok(
          lines.includes(`            ${host}`),
          `${job} reaches ${host}`,
        );
      }
    }
    // The job that builds the package, with npm, reaches no host of Google.
    assert.deepEqual(
      jobLines("package").filter((line) =>
        /^ +[a-z0-9.-]+\.googleapis\.com:443$/.test(line),
      ),
      [],
    );
  });

  test("the sign-in without a stored secret is the same in both", () => {
    const status = step("status", KEYLESS);
    const store = step("store", KEYLESS);
    assert.equal(store.run, status.run);
    assert.equal(store.env, status.env);
    assert.doesNotMatch(status.run, /\$\{\{/);
    assert.doesNotMatch(status.env, /secrets\./);
  });

  test("each signs in one way only, with the refresh token unless the set-up says keyless", () => {
    const status = step("status", REFRESH).if;
    assert.equal(
      status?.replace("sign-in != 'keyless'", "sign-in == 'keyless'"),
      step("status", KEYLESS).if,
    );
    assert.equal(
      status,
      "steps.release.outputs.tag != '' && steps.setup.outputs.sign-in != 'keyless'",
    );
    assert.equal(
      step("store", REFRESH).if,
      "needs.status.outputs.sign-in != 'keyless'",
    );
    assert.equal(
      step("store", KEYLESS).if,
      "needs.status.outputs.sign-in == 'keyless'",
    );
    assert.match(
      jobLines("status").join("\n"),
      /^ {6}sign-in: \$\{\{ steps\.setup\.outputs\.sign-in \}\}$/m,
    );
  });

  test("the job that reaches GitHub finds what the release asks for, and the job that delivers names it", () => {
    const status = jobLines("status");
    const decides = status.indexOf("        run: node scripts/store-status.ts");
    const finds = status.indexOf("        run: node scripts/store-new-asks.ts");
    assert.notEqual(decides, -1);
    assert.ok(finds > decides, "it runs after the decision");
    // Also for a warned item, which fails the decision and still gets the release.
    assert.match(
      step("status", ASKS).if ?? "",
      /^\$\{\{ !cancelled\(\) && steps\.decide\.outputs\.tag != '' \}\}$/,
    );
    assert.match(
      status.join("\n"),
      /^ {6}new-asks: \$\{\{ steps\.asks\.outputs\.new-asks \}\}$/m,
    );
    const delivery = step("store", DELIVER);
    assert.match(
      delivery.env.trim(),
      /^NEW_ASKS: \$\{\{ needs\.status\.outputs\.new-asks \}\}$/,
    );
    assert.doesNotMatch(delivery.run, /\$\{\{/);
  });

  test("the job that delivers runs no code of the repository", () => {
    assert.deepEqual(
      jobLines("store").filter((line) =>
        /actions\/checkout|node |npm /.test(line),
      ),
      [],
    );
  });
});

describe("the delivery", { skip }, () => {
  const STORE = "https://chromewebstore.googleapis.com";
  const ITEM = `${STORE}/v2/publishers/p/items/i`;
  const UPLOAD = `${STORE}/upload/v2/publishers/p/items/i:upload`;
  const ZIP = "dist/player-switch-for-autodarts-1.0.0.zip";
  const EDIT_LINK = "https://chrome.google.com/webstore/devconsole/p/i/edit";
  const NEW_ASKS =
    "What v1.0.0 asks for beyond the store's version 0.2.0: the permissions scripting and unlimitedStorage; the web-accessible page switcher.html; the languages es, fr, and nl.";
  const SUBMIT_REFUSED = {
    message:
      "Your submission does not meet the requirements to be published in the store. Check the Developer Dashboard for steps to resolve.",
    status: "INVALID_ARGUMENT",
    code: 400,
  };
  // The answer of the store that refused 1.0.0 on 2026-10-25.
  const LACKS_SOMETHING = JSON.stringify({
    error: {
      ...SUBMIT_REFUSED,
      details: [
        {
          "@type": "type.googleapis.com/google.rpc.ErrorInfo",
          reason: "INVALID_ITEM_METADATA",
          domain: "chromewebstore.googleapis.com",
          metadata: { itemId: "i", publisherId: "p" },
        },
        {
          "@type": "type.googleapis.com/google.rpc.LocalizedMessage",
          locale: "en-US",
          message: SUBMIT_REFUSED.message,
        },
        {
          "@type": "type.googleapis.com/google.rpc.Help",
          links: [{ description: "Edit Item Link", url: EDIT_LINK }],
        },
      ],
    },
  });
  const inReview = (version?: string): string =>
    JSON.stringify({
      submittedItemRevisionStatus: {
        state: "PENDING_REVIEW",
        distributionChannels:
          version === undefined ? [] : [{ crxVersion: version }],
      },
    });
  const deliver = (env: Readonly<Record<string, string>> = {}): Result =>
    runStep(
      `printf 'Authorization: Bearer store-token\\n' > "$RUNNER_TEMP/authorization"\n${step("store", DELIVER).run}`,
      {
        TAG: "v1.0.0",
        ITEM,
        UPLOAD,
        ZIP,
        NEW_ASKS,
        FAKE_UPLOAD_ANSWER: JSON.stringify({ uploadState: "SUCCEEDED" }),
        FAKE_PUBLISH_ANSWER: JSON.stringify({ state: "PENDING_REVIEW" }),
        FAKE_STATUS_ANSWER: "{}",
        ...env,
      },
    );
  const errors = (result: Result): string[] =>
    result.stdout.split("\n").filter((line) => line.startsWith("::error"));
  const urls = (result: Result): (string | undefined)[] =>
    result.calls.map((call) => call.url);

  test("uploads the zip, submits it and says so", () => {
    const result = deliver();
    assert.equal(result.status, 0, result.stdout);
    assert.deepEqual(urls(result), [UPLOAD, `${ITEM}:publish`]);
    assert.deepEqual(result.calls[1]?.headers, [
      "Authorization: Bearer store-token",
      "Content-Type: application/json",
    ]);
    assert.match(result.summary, /^The store took the upload of dist\//);
    assert.match(result.summary, /The release v1\.0\.0 is submitted;/);
    assert.deepEqual(errors(result), []);
  });

  test("waits for an upload that the store goes on processing", () => {
    const result = deliver({
      FAKE_UPLOAD_ANSWER: JSON.stringify({ uploadState: "IN_PROGRESS" }),
      FAKE_STATUS_ANSWER: JSON.stringify({ lastAsyncUploadState: "SUCCEEDED" }),
    });
    assert.equal(result.status, 0, result.stdout);
    assert.deepEqual(urls(result), [
      UPLOAD,
      `${ITEM}:fetchStatus`,
      `${ITEM}:publish`,
    ]);
  });

  test("passes on the warnings of a submission and takes a staged one", () => {
    const result = deliver({
      FAKE_PUBLISH_ANSWER: JSON.stringify({
        state: "STAGED",
        warningInfo: {
          warnings: [{ reason: "A_REASON", description: "A description." }],
        },
      }),
    });
    assert.equal(result.status, 0, result.stdout);
    assert.match(result.stdout, /^::warning::A_REASON: A description\.$/m);
    assert.match(
      result.summary,
      /The release v1\.0\.0 is in the state STAGED\./,
    );
  });

  test("fails on a state of the submission that it doesn't know", () => {
    const result = deliver({ FAKE_PUBLISH_ANSWER: JSON.stringify({}) });
    assert.equal(result.status, 1);
    assert.deepEqual(errors(result), [
      "::error title=Chrome Web Store::The submission of the release v1.0.0 ended in the state unknown.",
    ]);
  });

  describe("when the store refuses with INVALID_ITEM_METADATA", () => {
    const refused = (env: Readonly<Record<string, string>> = {}): Result =>
      deliver({
        FAKE_PUBLISH_EXIT: "22",
        FAKE_PUBLISH_ANSWER: LACKS_SOMETHING,
        ...env,
      });

    test("says in the summary and the annotation what the dashboard lacks and how to go on", () => {
      const result = refused();
      assert.equal(result.status, 1);
      const [error, ...more] = errors(result);
      assert.deepEqual(more, []);
      const lines = result.summary.split("\n");
      const problem = lines.find((line) => line.startsWith("- **Problem:** "));
      for (const text of [error, problem]) {
        for (const part of [
          "The store took the upload of v1.0.0 but refused to submit it for review (INVALID_ITEM_METADATA)",
          "the Developer Dashboard lacks something that this version needs",
          NEW_ASKS,
          "Permission justifications in store/listing.en.md",
          EDIT_LINK,
          "gh workflow run publish-store.yml -f tag=v1.0.0",
          "'When a run fails' in docs/releases.md",
        ]) {
          assert.ok(text?.includes(part), `${part} is in: ${text}`);
        }
      }
    });

    test("keeps the answer of the store in the log", () => {
      const result = refused();
      assert.ok(result.stdout.includes(LACKS_SOMETHING), result.stdout);
    });

    test("points to the dashboard, and leaves out the comparison, when it has neither link nor comparison", () => {
      const result = refused({
        NEW_ASKS: "",
        FAKE_PUBLISH_ANSWER: JSON.stringify({
          error: { details: [{ reason: "INVALID_ITEM_METADATA" }] },
        }),
      });
      assert.equal(result.status, 1);
      const [error] = errors(result);
      assert.match(
        error ?? "",
        /can't set it\. Under Privacy practices, .* is missing: https:\/\/chrome\.google\.com\/webstore\/devconsole\. Then/,
      );
    });

    test("escapes what would end the line of the annotation, not the summary", () => {
      const result = refused({ NEW_ASKS: "100% of it\nand more." });
      const [error] = errors(result);
      assert.ok(error?.includes("100%25 of it%0Aand more."), error);
      assert.ok(result.summary.includes("100% of it\nand more."));
    });
  });

  describe("when a review began after the job that decides asked", () => {
    for (const [what, env, expected] of [
      [
        "the submission is refused for this version",
        {
          FAKE_PUBLISH_EXIT: "22",
          FAKE_PUBLISH_ANSWER: LACKS_SOMETHING,
          FAKE_STATUS_ANSWER: inReview("1.0.0"),
        },
        "v1.0.0 is in review already; Google publishes it after the review.",
      ],
      [
        "the upload is refused for an earlier version",
        {
          FAKE_UPLOAD_EXIT: "22",
          FAKE_UPLOAD_ANSWER: JSON.stringify({ error: { code: 400 } }),
          FAKE_STATUS_ANSWER: inReview("0.9.0"),
        },
        "The store reviews 0.9.0 and takes no new version until the review ends; the daily run delivers v1.0.0 after it.",
      ],
      [
        "the upload ends in a failure, for a version that the store doesn't name",
        {
          FAKE_UPLOAD_ANSWER: JSON.stringify({ uploadState: "FAILED" }),
          FAKE_STATUS_ANSWER: inReview(),
        },
        "The store reviews a submission and takes no new version until the review ends; the daily run delivers v1.0.0 after it.",
      ],
    ] as const) {
      test(`a note and no failure when ${what}`, () => {
        const result = deliver(env);
        assert.equal(result.status, 0, result.stdout);
        assert.deepEqual(errors(result), []);
        assert.ok(result.stdout.includes(expected), result.stdout);
        assert.ok(result.summary.includes(expected), result.summary);
        assert.equal(urls(result).at(-1), `${ITEM}:fetchStatus`);
      });
    }

    test("the submission doesn't follow an upload that the review refused", () => {
      const result = deliver({
        FAKE_UPLOAD_EXIT: "22",
        FAKE_UPLOAD_ANSWER: "{}",
        FAKE_STATUS_ANSWER: inReview("1.0.0"),
      });
      assert.deepEqual(urls(result), [UPLOAD, `${ITEM}:fetchStatus`]);
    });
  });

  describe("when no review explains a refusal", () => {
    for (const [what, env, message] of [
      [
        "the store refuses the upload",
        { FAKE_UPLOAD_EXIT: "22", FAKE_UPLOAD_ANSWER: "<html>" },
        `The store refused the upload of ${ZIP}.`,
      ],
      [
        "the upload ends in a failure",
        { FAKE_UPLOAD_ANSWER: JSON.stringify({ uploadState: "FAILED" }) },
        `The upload of ${ZIP} ended in the state FAILED.`,
      ],
      [
        "the store doesn't tell the state of the upload",
        { FAKE_UPLOAD_ANSWER: "{}" },
        `The upload of ${ZIP} ended in the state unknown.`,
      ],
      [
        "the store refuses the submission for another reason",
        {
          FAKE_PUBLISH_EXIT: "22",
          FAKE_PUBLISH_ANSWER: JSON.stringify({
            error: {
              message: "Not this time.",
              details: [{ reason: "ANOTHER_REASON" }],
            },
          }),
        },
        "The store refused to submit the release v1.0.0 for review (ANOTHER_REASON): Not this time.",
      ],
      [
        "the store refuses the submission without an answer",
        { FAKE_PUBLISH_EXIT: "22", FAKE_PUBLISH_ANSWER: "<html>" },
        "The store refused to submit the release v1.0.0 for review",
      ],
      [
        "the status of the item is another than a review",
        {
          FAKE_PUBLISH_EXIT: "22",
          FAKE_PUBLISH_ANSWER: "{}",
          FAKE_STATUS_ANSWER: JSON.stringify({
            submittedItemRevisionStatus: { state: "REJECTED" },
          }),
        },
        "The store refused to submit the release v1.0.0 for review",
      ],
      [
        "the store answers the status with no JSON",
        {
          FAKE_PUBLISH_EXIT: "22",
          FAKE_PUBLISH_ANSWER: "{}",
          FAKE_STATUS_ANSWER: "<html>",
        },
        "The store refused to submit the release v1.0.0 for review",
      ],
      [
        "the store doesn't answer the status of the item",
        {
          FAKE_PUBLISH_EXIT: "22",
          FAKE_PUBLISH_ANSWER: "{}",
          FAKE_STATUS_EXIT: "22",
          FAKE_STATUS_ANSWER: "",
        },
        "The store refused to submit the release v1.0.0 for review",
      ],
    ] as const) {
      test(`fails with the reason when ${what}`, () => {
        const result = deliver(env);
        assert.equal(result.status, 1, result.stdout);
        assert.deepEqual(errors(result), [
          `::error title=Chrome Web Store::${message}`,
        ]);
        assert.ok(
          result.summary.includes(`- **Problem:** ${message}`),
          result.summary,
        );
      });
    }

    for (const [what, env, earlier] of [
      [
        "the submission",
        { FAKE_PUBLISH_EXIT: "7", FAKE_PUBLISH_NO_ANSWER: "1" },
        "uploadState",
      ],
      [
        "the status of an upload in progress",
        {
          FAKE_UPLOAD_ANSWER: JSON.stringify({ uploadState: "IN_PROGRESS" }),
          FAKE_STATUS_EXIT: "7",
          FAKE_STATUS_NO_ANSWER: "1",
        },
        "IN_PROGRESS",
      ],
    ] as const) {
      test(`shows no earlier answer as the answer to ${what} when it gets none`, () => {
        const result = deliver(env);
        assert.equal(result.status, 1, result.stdout);
        assert.equal(errors(result).length, 1);
        assert.ok(!result.stdout.includes(earlier), result.stdout);
      });
    }

    test("fails when the store stops telling the state of an upload in progress", () => {
      const result = deliver({
        FAKE_UPLOAD_ANSWER: JSON.stringify({ uploadState: "IN_PROGRESS" }),
        FAKE_STATUS_EXIT: "22",
        FAKE_STATUS_ANSWER: "",
      });
      assert.equal(result.status, 1);
      assert.deepEqual(errors(result), [
        "::error title=Chrome Web Store::The store didn't tell the status of the upload.",
      ]);
    });
  });
});

describe("the check of the set-up", { skip }, () => {
  const SECRETS = {
    CWS_CLIENT_ID: "client",
    CWS_CLIENT_SECRET: "secret",
    CWS_REFRESH_TOKEN: "refresh",
  };
  const check = (env: Readonly<Record<string, string>>): Result =>
    runStep(step("status", SETUP).run, {
      CWS_CLIENT_ID: "",
      CWS_CLIENT_SECRET: "",
      CWS_REFRESH_TOKEN: "",
      CWS_EXTENSION_ID: "item",
      CWS_PUBLISHER_ID: "publisher",
      CWS_WORKLOAD_IDENTITY_PROVIDER: "",
      CWS_SERVICE_ACCOUNT: "",
      ...env,
    });
  const errors = (result: Result): string[] =>
    result.stdout.split("\n").filter((line) => line.startsWith("::error"));
  const warnings = (result: Result): string[] =>
    result.stdout.split("\n").filter((line) => line.startsWith("::warning"));

  test("without the two variables, it signs in with the refresh token as before", () => {
    const result = check(SECRETS);
    assert.equal(result.status, 0);
    assert.equal(result.output, "sign-in=refresh-token\n");
    assert.deepEqual(errors(result), []);
  });

  test("without the two variables, it names each secret that is missing", () => {
    const result = check({ ...SECRETS, CWS_REFRESH_TOKEN: "" });
    assert.equal(result.status, 1);
    assert.deepEqual(errors(result), [
      "::error::The secret CWS_REFRESH_TOKEN of the environment chrome-web-store is missing; docs/releases.md says how to set it.",
    ]);
  });

  test("with the two variables, it signs in without any secret", () => {
    const result = check({
      CWS_WORKLOAD_IDENTITY_PROVIDER: PROVIDER,
      CWS_SERVICE_ACCOUNT: SERVICE_ACCOUNT,
    });
    assert.equal(result.status, 0);
    assert.equal(result.output, "sign-in=keyless\n");
    assert.deepEqual(errors(result), []);
    assert.deepEqual(warnings(result), []);
  });

  test("with the two variables, it warns of each secret that is left", () => {
    const result = check({
      ...SECRETS,
      CWS_WORKLOAD_IDENTITY_PROVIDER: PROVIDER,
      CWS_SERVICE_ACCOUNT: SERVICE_ACCOUNT,
    });
    assert.equal(result.status, 0);
    assert.equal(result.output, "sign-in=keyless\n");
    assert.deepEqual(
      warnings(result).map((line) => line.match(/secret (CWS_\w+)/)?.[1]),
      ["CWS_CLIENT_ID", "CWS_CLIENT_SECRET", "CWS_REFRESH_TOKEN"],
    );
    assert.match(
      warnings(result)[0] ?? "",
      /gh secret delete CWS_CLIENT_ID --env chrome-web-store/,
    );
  });

  for (const [what, env, variable] of [
    [
      "the provider alone",
      { CWS_WORKLOAD_IDENTITY_PROVIDER: PROVIDER },
      "CWS_SERVICE_ACCOUNT",
    ],
    [
      "the service account alone",
      { CWS_SERVICE_ACCOUNT: SERVICE_ACCOUNT },
      "CWS_WORKLOAD_IDENTITY_PROVIDER",
    ],
    [
      "the provider with the prefix of the audience",
      {
        CWS_WORKLOAD_IDENTITY_PROVIDER: `//iam.googleapis.com/${PROVIDER}`,
        CWS_SERVICE_ACCOUNT: SERVICE_ACCOUNT,
      },
      "CWS_WORKLOAD_IDENTITY_PROVIDER",
    ],
    [
      "the provider with the ID of the project in place of its number",
      {
        CWS_WORKLOAD_IDENTITY_PROVIDER: PROVIDER.replace(
          "123456789",
          "a-project",
        ),
        CWS_SERVICE_ACCOUNT: SERVICE_ACCOUNT,
      },
      "CWS_WORKLOAD_IDENTITY_PROVIDER",
    ],
    [
      "the address of a person as the service account",
      {
        CWS_WORKLOAD_IDENTITY_PROVIDER: PROVIDER,
        CWS_SERVICE_ACCOUNT: "someone@example.com",
      },
      "CWS_SERVICE_ACCOUNT",
    ],
  ] as const) {
    test(`with ${what}, it names the variable to fix`, () => {
      const result = check(env);
      assert.equal(result.status, 1);
      assert.equal(errors(result).length, 1);
      assert.match(
        errors(result)[0] ?? "",
        new RegExp(
          `^::error::The variable ${variable} is missing or names no `,
        ),
      );
    });
  }

  test("either way, it names each ID of the store that is missing", () => {
    const result = check({
      CWS_WORKLOAD_IDENTITY_PROVIDER: PROVIDER,
      CWS_SERVICE_ACCOUNT: SERVICE_ACCOUNT,
      CWS_PUBLISHER_ID: "",
    });
    assert.equal(result.status, 1);
    assert.deepEqual(errors(result), [
      "::error::The variable CWS_PUBLISHER_ID is missing; docs/releases.md says how to set it.",
    ]);
  });
});

describe("the sign-in without a stored secret", { skip }, () => {
  const OK = {
    FAKE_OIDC_ANSWER: JSON.stringify({ count: 1, value: "the-oidc-jwt" }),
    FAKE_STS_ANSWER: JSON.stringify({
      access_token: "federated-token",
      issued_token_type: "urn:ietf:params:oauth:token-type:access_token",
      token_type: "Bearer",
      expires_in: 3599,
    }),
    FAKE_IAM_ANSWER: JSON.stringify({
      accessToken: "store-token",
      expireTime: "2026-10-25T12:20:00Z",
    }),
  };
  const signIn = (env: Readonly<Record<string, string>> = {}): Result =>
    runStep(step("store", KEYLESS).run, {
      PROVIDER,
      SERVICE_ACCOUNT,
      ACTIONS_ID_TOKEN_REQUEST_URL: OIDC_URL,
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: "request-token",
      ...OK,
      ...env,
    });
  const error = (result: Result): string =>
    result.stdout.split("\n").find((line) => line.startsWith("::error")) ?? "";

  test("trades the OIDC token of GitHub for a token of the service account", () => {
    const result = signIn();
    assert.equal(result.status, 0, result.stdout);
    assert.equal(result.authorization, "Authorization: Bearer store-token\n");
    const [oidc, sts, iam, ...more] = result.calls;
    assert.deepEqual(more, []);
    assert.deepEqual(oidc, {
      url: OIDC_URL,
      get: true,
      headers: ["Authorization: bearer request-token"],
      data: [`audience=https://iam.googleapis.com/${PROVIDER}`],
    });
    assert.equal(sts?.url, "https://sts.googleapis.com/v1/token");
    assert.equal(sts?.get, false);
    assert.deepEqual(sts?.headers, []);
    assert.deepEqual(sts?.data, [
      `audience=//iam.googleapis.com/${PROVIDER}`,
      "grant_type=urn:ietf:params:oauth:grant-type:token-exchange",
      "requested_token_type=urn:ietf:params:oauth:token-type:access_token",
      "scope=https://www.googleapis.com/auth/cloud-platform",
      "subject_token_type=urn:ietf:params:oauth:token-type:jwt",
      "subject_token=the-oidc-jwt",
    ]);
    assert.equal(
      iam?.url,
      `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${SERVICE_ACCOUNT}:generateAccessToken`,
    );
    assert.deepEqual(iam?.headers, [
      "Authorization: Bearer federated-token",
      "Content-Type: application/json",
    ]);
    assert.deepEqual(JSON.parse(iam?.data[0] ?? ""), {
      scope: ["https://www.googleapis.com/auth/chromewebstore"],
      lifetime: "1200s",
    });
  });

  test("masks each token and leaves only the header of the last one behind", () => {
    const result = signIn();
    assert.equal(result.status, 0, result.stdout);
    assert.match(result.stdout, /^::add-mask::federated-token$/m);
    assert.match(result.stdout, /^::add-mask::store-token$/m);
    assert.doesNotMatch(result.stdout, /the-oidc-jwt|request-token/);
    assert.deepEqual(result.files, ["authorization"]);
    assert.equal(result.summary, "");
  });

  test("names the permission when GitHub offers the job no OIDC token", () => {
    const result = signIn({
      ACTIONS_ID_TOKEN_REQUEST_URL: "",
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: "",
    });
    assert.equal(result.status, 1);
    assert.match(error(result), /needs the permission id-token: write/);
    assert.match(
      result.summary,
      /^- \*\*Problem:\*\* GitHub offers this job no OIDC token/,
    );
    assert.deepEqual(result.calls, []);
    assert.equal(result.authorization, undefined);
  });

  test("passes on why Google's Security Token Service turned the token away", () => {
    const result = signIn({
      FAKE_STS_EXIT: "22",
      FAKE_STS_ANSWER: JSON.stringify({
        error: "invalid_grant",
        error_description:
          "The given credential is rejected by the attribute condition.",
      }),
    });
    assert.equal(result.status, 1);
    assert.match(
      error(result),
      /turned the OIDC token of GitHub away \(invalid_grant: The given credential is rejected by the attribute condition\.\)/,
    );
    assert.match(
      error(result),
      /this repository, the branch main and the workflow publish-store\.yml/,
    );
    assert.match(
      result.summary,
      /^- \*\*Problem:\*\* Google's Security Token Service/,
    );
    assert.equal(result.calls.length, 2);
    assert.deepEqual(result.files, []);
  });

  test("passes on why Google issued no token of the service account", () => {
    const result = signIn({
      FAKE_IAM_EXIT: "22",
      FAKE_IAM_ANSWER: JSON.stringify({
        error: {
          code: 403,
          message:
            "Permission 'iam.serviceAccounts.getAccessToken' denied on resource (or it may not exist).",
          status: "PERMISSION_DENIED",
        },
      }),
    });
    assert.equal(result.status, 1);
    assert.match(
      error(result),
      /service account in CWS_SERVICE_ACCOUNT \(Permission 'iam\.serviceAccounts\.getAccessToken' denied on resource \(or it may not exist\)\.\)/,
    );
    assert.match(error(result), /the role Workload Identity User/);
    assert.deepEqual(result.files, []);
  });

  for (const [what, env, message] of [
    [
      "GitHub issues no OIDC token",
      { FAKE_OIDC_EXIT: "22", FAKE_OIDC_ANSWER: "" },
      "GitHub issued no OIDC token for the job. Start the run again.",
    ],
    [
      "GitHub answers without a token",
      { FAKE_OIDC_ANSWER: "{}" },
      "GitHub's answer holds no OIDC token.",
    ],
    [
      "the Security Token Service fails without an answer",
      { FAKE_STS_EXIT: "22", FAKE_STS_ANSWER: "<html>Bad Gateway</html>" },
      "(no answer)",
    ],
    [
      "the Security Token Service answers without a token",
      { FAKE_STS_ANSWER: "{}" },
      "The answer of Google's Security Token Service holds no token.",
    ],
    [
      "IAM fails without an answer",
      { FAKE_IAM_EXIT: "22", FAKE_IAM_ANSWER: "" },
      "(no answer)",
    ],
    [
      "IAM answers without a token",
      { FAKE_IAM_ANSWER: "{}" },
      "Google's answer holds no access token of the service account.",
    ],
  ] as const) {
    test(`fails, and leaves no token behind, when ${what}`, () => {
      const result = signIn(env);
      assert.equal(result.status, 1);
      assert.ok(error(result).includes(message), result.stdout);
      assert.deepEqual(result.files, []);
    });
  }
});
