// Tests how .github/workflows/publish-store.yml signs in to the Chrome Web Store
// (decision 0010): the check of its set-up chooses between the refresh token and the
// sign-in without a stored secret, only the two jobs that talk to the store may ask
// GitHub for an OIDC token, the sign-in without a secret is the same in both, and it
// runs against a fake curl that answers as GitHub and Google do. The steps run in bash
// with jq, as on the runner; on a computer without them those tests skip, other than
// in the CI.
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

const WORKFLOW = readFileSync(
  fileURLToPath(
    new URL("../.github/workflows/publish-store.yml", import.meta.url),
  ),
  "utf8",
).replaceAll("\r\n", "\n");
const LINES = WORKFLOW.split("\n");

const SETUP = "Check the set-up of the environment";
const REFRESH = "Sign in to the Chrome Web Store API with the refresh token";
const KEYLESS = "Sign in to the Chrome Web Store API with GitHub's OIDC token";

const PROVIDER =
  "projects/123456789/locations/global/workloadIdentityPools/github/providers/player-switch";
const SERVICE_ACCOUNT = "chrome-web-store@a-project.iam.gserviceaccount.com";
const OIDC_URL = "https://token.actions.example/idtoken?api-version=2.0";

/** The lines of a job, from its key to the key of the next job. */
const jobLines = (job: string): string[] => {
  const start = LINES.indexOf(`  ${job}:`);
  assert.notEqual(start, -1, `the workflow has a job "${job}"`);
  const end = LINES.findIndex(
    (line, index) => index > start && /^ {2}\S/.test(line),
  );
  return LINES.slice(start, end === -1 ? undefined : end);
};

/** A step of a job: its condition, its environment and its script. */
interface Step {
  readonly if: string | undefined;
  readonly env: string;
  readonly run: string;
}

const step = (job: string, name: string): Step => {
  const lines = jobLines(job);
  const start = lines.indexOf(`      - name: ${name}`);
  assert.notEqual(start, -1, `the job "${job}" has a step "${name}"`);
  const end = lines.findIndex(
    (line, index) => index > start && /^ {6}- /.test(line),
  );
  const body = lines.slice(start + 1, end === -1 ? undefined : end);
  /** The lines below a key of the step that are indented deeper than the key. */
  const block = (key: string): string[] => {
    const at = body.findIndex((line) => line.startsWith(`        ${key}:`));
    if (at === -1) {
      return [];
    }
    const after = body.slice(at + 1);
    const stop = after.findIndex((line) => /^ {0,8}\S/.test(line));
    return after.slice(0, stop === -1 ? undefined : stop);
  };
  const condition = body
    .find((line) => line.startsWith("        if: "))
    ?.slice("        if: ".length);
  return {
    if: condition,
    env: block("env").join("\n"),
    run: `${block("run")
      .map((line) => line.slice(10))
      .join("\n")
      .trimEnd()}\n`,
  };
};

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
