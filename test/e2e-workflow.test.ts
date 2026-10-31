// Tests how the jobs of .github/workflows/e2e.yml get through Harden-Runner's block
// mode, whose failures were the flaky runs of this workflow: on the hosted runners of
// the region westus2, GitHub tries a DNS resolver of its own, so Harden-Runner knows
// another address of a host than the runner connects to. A step then fails with
// ECONNREFUSED, and the runner can't reach its own service at the end of the job, which
// hangs until its time limit (step-security/harden-runner#708). So each job pins a
// Harden-Runner with the fix, and waits until it may reach its hosts before a step
// needs them. The wait runs in bash with a fake curl and clock, as the steps of
// publish-store.test.ts do; on a computer without bash it skips, other than in the CI.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { describe, test } from "node:test";
import { readWorkflow } from "./workflow.ts";

const { text, jobLines, step } = readWorkflow("e2e.yml");

/** Every job of the workflow, so that a new one can't miss what the tests ask for. */
const JOBS = [
  ...(text.split("\njobs:\n")[1]?.matchAll(/^ {2}([\w-]+):$/gm) ?? []),
].map(([, job]) => job ?? "");
const BLOCK = "Block every host that the job doesn't need";
const WAIT = "Wait until Harden-Runner lets the hosts through";
/** The first version that takes GitHub's trial of a DNS resolver off the runner. */
const FIXED_VERSION = "2.22.3";

/** The first lines of the steps of a job: a name, or an action without one. */
const stepsOf = (job: string): string[] =>
  jobLines(job)
    .filter((line) => /^ {6}- /.test(line))
    .map((line) => line.trim());

/** The lines of a value of a job that YAML folds, as `HOSTS: >`. */
const folded = (job: string, key: string): string[] => {
  const lines = jobLines(job);
  const at = lines.findIndex((line) => line.trim() === `${key}: >`);
  assert.notEqual(at, -1, `the job "${job}" has the value "${key}"`);
  const indent = (line: string | undefined): number => line?.search(/\S/) ?? -1;
  const after = lines.slice(at + 1);
  const end = after.findIndex((line) => indent(line) <= indent(lines[at]));
  return after
    .slice(0, end === -1 ? undefined : end)
    .map((line) => line.trim());
};

describe("each job of the workflow E2E", () => {
  for (const job of JOBS) {
    test(`${job} blocks with a Harden-Runner that has the fix of the hang`, () => {
      const uses = jobLines(job).find((line) =>
        line.includes("step-security/harden-runner@"),
      );
      const version = /@[0-9a-f]{40} # v(\d+\.\d+\.\d+)$/.exec(uses ?? "")?.[1];
      assert.ok(version, `the job "${job}" pins Harden-Runner: ${uses}`);
      assert.ok(
        version.localeCompare(FIXED_VERSION, undefined, { numeric: true }) >= 0,
        `v${version} of Harden-Runner in the job "${job}" still hangs; v${FIXED_VERSION} has the fix`,
      );
      assert.ok(
        jobLines(job).includes("          egress-policy: block"),
        `the job "${job}" blocks every host that it doesn't need`,
      );
    });

    test(`${job} waits for its hosts right after Harden-Runner`, () => {
      assert.deepEqual(stepsOf(job).slice(0, 2), [
        `- name: ${BLOCK}`,
        `- name: ${WAIT}`,
      ]);
      assert.deepEqual(
        folded(job, "HOSTS"),
        folded(job, "allowed-endpoints"),
        "the wait asks exactly the hosts that the job may reach",
      );
      // Within the time limit of the job, with the two minutes of the wait for Docker.
      assert.equal(step(job, WAIT).timeoutMinutes, "4");
    });
  }

  test("all wait with the same script", () => {
    assert.equal(new Set(JOBS.map((job) => step(job, WAIT).run)).size, 1);
  });
});

const skip =
  spawnSync("bash", ["-c", "true"]).status === 0 || process.env.CI
    ? false
    : "No bash here: the runs of the wait skip; the CI runs them.";

/** What the wait did: its calls of curl, its output and the seconds that it took. */
interface Wait {
  readonly status: number | null;
  readonly stdout: string;
  readonly calls: readonly string[];
  readonly seconds: number;
}

/** Runs the wait as the runner does, on a network that refuses each host's first calls. */
const runWait = (hosts: readonly string[], refusals: number): Wait => {
  const dir = mkdtempSync(join(tmpdir(), "e2e-workflow-"));
  try {
    const bin = join(dir, "bin");
    mkdirSync(bin);
    const tools = {
      // Records the call and refuses the first FAKE_REFUSALS of each address, with the
      // exit code of curl for a refused connection.
      curl: [
        'echo "$*" >> "$FAKE_CALLS"',
        "for url; do :; done",
        'asked="$(grep -c -F -- "$url" "$FAKE_CALLS")"',
        "((asked > FAKE_REFUSALS)) || exit 7",
      ],
      date: ['cat "$FAKE_CLOCK"'],
      sleep: ['echo $(($(cat "$FAKE_CLOCK") + $1)) > "$FAKE_CLOCK"'],
    };
    for (const [name, script] of Object.entries(tools)) {
      writeFileSync(
        join(bin, name),
        `#!/usr/bin/env bash\n${script.join("\n")}\n`,
      );
      chmodSync(join(bin, name), 0o755);
    }
    const calls = join(dir, "calls");
    const clock = join(dir, "clock");
    writeFileSync(calls, "");
    writeFileSync(clock, "1000\n");
    writeFileSync(join(dir, "step.sh"), step("gate", WAIT).run);
    const result = spawnSync(
      "bash",
      ["--noprofile", "--norc", "-e", join(dir, "step.sh")],
      {
        encoding: "utf8",
        env: {
          PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
          HOSTS: `${hosts.join("\n")}\n`,
          FAKE_CALLS: calls,
          FAKE_CLOCK: clock,
          FAKE_REFUSALS: String(refusals),
        },
      },
    );
    return {
      status: result.status,
      stdout: result.stdout,
      calls: readFileSync(calls, "utf8").split("\n").slice(0, -1),
      seconds: Number(readFileSync(clock, "utf8")) - 1000,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const QUESTION =
  "--silent --head --connect-timeout 3 --max-time 5 --output /dev/null";

describe("the wait for the hosts", { skip }, () => {
  test("asks each host once, and only that, when Harden-Runner lets it through", () => {
    const wait = runWait(["api.github.com:443", "github.com:443"], 0);
    assert.equal(wait.status, 0);
    assert.deepEqual(wait.calls, [
      `${QUESTION} https://api.github.com/`,
      `${QUESTION} https://github.com/`,
    ]);
    assert.equal(wait.stdout, "");
    assert.equal(wait.seconds, 0);
  });

  test("asks every 3 seconds until Harden-Runner lets the host through", () => {
    const wait = runWait(["github.com:443"], 3);
    assert.equal(wait.status, 0);
    assert.equal(wait.calls.length, 4);
    assert.equal(wait.seconds, 9);
    assert.equal(
      wait.stdout.match(
        /Harden-Runner still blocks github\.com, waiting 3 s\./g,
      )?.length,
      3,
    );
    assert.doesNotMatch(wait.stdout, /::warning::/);
  });

  test("goes on with a warning after two minutes, and leaves the failure to the step", () => {
    const wait = runWait(["github.com:443", "registry.npmjs.org:443"], 1000);
    assert.equal(wait.status, 0);
    assert.equal(wait.seconds, 120);
    // From 0 to 120 seconds, and the host after it only once: the two minutes are over.
    assert.deepEqual(wait.calls, [
      ...Array.from({ length: 41 }, () => `${QUESTION} https://github.com/`),
      `${QUESTION} https://registry.npmjs.org/`,
    ]);
    for (const host of ["github.com", "registry.npmjs.org"]) {
      assert.ok(
        wait.stdout.includes(
          `::warning::Harden-Runner still blocks ${host} after two minutes`,
        ),
        wait.stdout,
      );
    }
  });

  test("asks no host for a wildcard, which names none", () => {
    const wait = runWait(["*.blob.core.windows.net:443", "github.com:443"], 0);
    assert.equal(wait.status, 0);
    assert.deepEqual(wait.calls, [`${QUESTION} https://github.com/`]);
  });
});
