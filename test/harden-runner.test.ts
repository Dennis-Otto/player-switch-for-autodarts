// Tests how the jobs of the workflows that this project owns get through Harden-Runner's
// block mode, whose failures were the flaky runs of E2E: on the hosted runners of the
// region westus2, GitHub tries a DNS resolver of its own, so Harden-Runner knows another
// address of a host than the runner connects to. A step then fails with ECONNREFUSED,
// and the runner can't reach its own service at the end of the job, which hangs until
// its time limit (step-security/harden-runner#708). So each job pins a Harden-Runner
// with the fix, and waits until it may reach its hosts before a step needs them. The
// wait runs in bash with a fake curl and clock; on a computer without bash it skips,
// other than in the CI.
//
// Harden-Runner also goes on without its agent, and so without any block, when it can't
// download the agent, as in GitHub's outage of 8 November 2026, or the agent doesn't
// start (decision 0134 of the blueprint). So each job stops right after Harden-Runner
// when it doesn't block, with the blueprint's step, and no later step runs without the
// block after that failure, but the wait for the removal of Docker, which needs no host.
// The step runs in bash with the folder of the agent in a folder of its own, and fakes
// of systemctl and the clock.
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
import { suite, test } from "node:test";
import { readWorkflow } from "./workflow.ts";

/**
 * The workflows of this project with Harden-Runner, by the name of its step. The blueprint
 * renders the others, and brings their wait with its release.
 */
const WORKFLOWS = {
  "e2e.yml": "Block every host that the job doesn't need",
  "upstream.yml": "Block every host that the job doesn't need",
};
const BLOCKS = "Make sure that Harden-Runner blocks";
const WAIT = "Wait until Harden-Runner lets the hosts through";
/** The one step that runs after the failure of BLOCKS: it reaches no host. */
const DOCKER = "Wait until Harden-Runner has removed Docker";
/** The first version that takes GitHub's trial of a DNS resolver off the runner. */
const FIXED_VERSION = "2.22.3";

/**
 * The step BLOCKS of the blueprint, which its update brings to the workflows that it
 * renders, such as welcome.yml, and whose tests run it in every case.
 */
const theBlueprints = readWorkflow("welcome.yml").step("welcome", BLOCKS);

/** The explanations of the checks of this project, which the PR coach shows. */
const explanations = readFileSync(
  new URL("../.github/checks.project.toml", import.meta.url),
  "utf8",
).replaceAll("\r\n", "\n");

/** The script of the wait of each job, read when the test of them runs. */
const waits: (() => string)[] = [];

for (const [file, block] of Object.entries(WORKFLOWS)) {
  const { text, jobLines, step } = readWorkflow(file);

  /** Every job of the workflow, so that a new one can't miss what the tests ask for. */
  const jobs = [
    ...(text.split("\njobs:\n")[1]?.matchAll(/^ {2}([\w-]+):$/gm) ?? []),
  ].map(([, job]) => job ?? "");

  /** The lines of each step of a job, from its first line to the next step. */
  const stepLines = (job: string): string[][] => {
    const steps: string[][] = [];
    for (const line of jobLines(job)) {
      if (/^ {6}- /.test(line)) {
        steps.push([line]);
      } else {
        steps.at(-1)?.push(line);
      }
    }
    return steps;
  };

  /** The first lines of the steps of a job: a name, or an action without one. */
  const stepsOf = (job: string): string[] =>
    stepLines(job).map(([first]) => first?.trim() ?? "");

  /** The condition of a step, with the lines of a folded one joined, or "" for none. */
  const conditionOf = (lines: readonly string[]): string => {
    const at = lines.findIndex((line) => line.startsWith("        if:"));
    if (at === -1) {
      return "";
    }
    const after = lines.slice(at + 1);
    const end = after.findIndex((line) => !/^ {10}\S/.test(line));
    return [
      lines[at]?.slice("        if:".length) ?? "",
      ...after.slice(0, end === -1 ? undefined : end),
    ]
      .map((line) => line.trim())
      .join(" ")
      .trim();
  };

  /** The lines of a value of a job that YAML folds, as `HOSTS: >`. */
  const folded = (job: string, key: string): string[] => {
    const lines = jobLines(job);
    const at = lines.findIndex((line) => line.trim() === `${key}: >`);
    assert.notEqual(at, -1, `the job "${job}" has the value "${key}"`);
    const indent = (line: string | undefined): number =>
      line?.search(/\S/) ?? -1;
    const after = lines.slice(at + 1);
    const end = after.findIndex((line) => indent(line) <= indent(lines[at]));
    return after
      .slice(0, end === -1 ? undefined : end)
      .map((line) => line.trim());
  };

  suite(`each job of ${file}`, () => {
    test("the workflow has jobs", () => {
      assert.notEqual(jobs.length, 0);
    });

    for (const job of jobs) {
      waits.push(() => step(job, WAIT).run);

      test(`${job} blocks with a Harden-Runner that has the fix of the hang`, () => {
        const uses = jobLines(job).find((line) =>
          line.includes("step-security/harden-runner@"),
        );
        const version = /@[0-9a-f]{40} # v(\d+\.\d+\.\d+)$/.exec(
          uses ?? "",
        )?.[1];
        assert.ok(version, `the job "${job}" pins Harden-Runner: ${uses}`);
        assert.ok(
          version.localeCompare(FIXED_VERSION, undefined, { numeric: true }) >=
            0,
          `v${version} of Harden-Runner in the job "${job}" still hangs; v${FIXED_VERSION} has the fix`,
        );
        assert.ok(
          jobLines(job).includes("          egress-policy: block"),
          `the job "${job}" blocks every host that it doesn't need`,
        );
      });

      test(`${job} makes sure that Harden-Runner blocks, then waits for its hosts`, () => {
        assert.deepEqual(stepsOf(job).slice(0, 3), [
          `- name: ${block}`,
          `- name: ${BLOCKS}`,
          `- name: ${WAIT}`,
        ]);
        assert.deepEqual(
          folded(job, "HOSTS"),
          folded(job, "allowed-endpoints"),
          "the wait asks exactly the hosts that the job may reach",
        );
        // Within the time limit of each job, the shortest of which has five minutes.
        assert.equal(step(job, WAIT).timeoutMinutes, "4");
      });

      test(`${job} stops when Harden-Runner doesn't block, as the blueprint's jobs do`, () => {
        const blocks = step(job, BLOCKS);
        // Later steps ask for its outcome by this id.
        assert.equal(blocks.id, "blocks");
        assert.equal(blocks.if, undefined, "the step runs in every run");
        assert.equal(blocks.timeoutMinutes, theBlueprints.timeoutMinutes);
        assert.equal(
          blocks.run,
          theBlueprints.run,
          `the job "${job}" makes sure with the script of the blueprint, as in welcome.yml`,
        );
      });

      test(`${job} runs no step after a failure while Harden-Runner doesn't block, but the wait for Docker`, () => {
        const steps = stepLines(job);
        const at = stepsOf(job).indexOf(`- name: ${BLOCKS}`);
        assert.notEqual(at, -1, `the job "${job}" has the step "${BLOCKS}"`);
        for (const lines of steps.slice(at + 1)) {
          const condition = conditionOf(lines);
          if (
            /\b(always|failure|cancelled)\(\)/.test(condition) &&
            lines[0]?.trim() !== `- name: ${DOCKER}`
          ) {
            assert.ok(
              condition.includes("steps.blocks.outcome != 'failure'"),
              `"${lines[0]?.trim()}" of the job "${job}" runs after a failure, also when Harden-Runner didn't block: ${condition}`,
            );
          }
        }
      });

      // A job that explains no failure of its own, such as "changes", has no check of
      // the PR coach.
      if (!stepsOf(job).includes("- name: Explain the failure")) {
        continue;
      }
      test(`${job} explains, when it fails, that Harden-Runner may have stopped it`, () => {
        const check = /CHECK: (\S+)/.exec(
          step(job, "Explain the failure").env,
        )?.[1];
        assert.ok(check, `the job "${job}" names the check that it explains`);
        const section = explanations
          .split(`\n[check."${check}"]\n`)[1]
          ?.split("\n[")[0];
        assert.ok(section, `.github/checks.project.toml explains "${check}"`);
        assert.ok(
          section
            .replaceAll(/\s+/g, " ")
            .includes(
              `When the step *${BLOCKS}* stopped the job, Harden-Runner had no agent that blocks`,
            ),
          `the explanation of "${check}" says what the stop of the step "${BLOCKS}" means`,
        );
      });
    }
  });
}

test("every job of the workflows waits with the same script", () => {
  assert.equal(new Set(waits.map((wait) => wait())).size, 1);
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
  const dir = mkdtempSync(join(tmpdir(), "harden-runner-"));
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
    writeFileSync(
      join(dir, "step.sh"),
      readWorkflow("e2e.yml").step("gate", WAIT).run,
    );
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

suite("the wait for the hosts", { skip }, () => {
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

/** What Harden-Runner left on the runner for its agent. */
interface Agent {
  /** Whether it made the folder of the agent, which it skips when it doesn't install it. */
  readonly folder?: boolean;
  /** Whether it downloaded the agent into the folder. */
  readonly downloaded?: boolean;
  /** The status that the agent writes, after `after` seconds; none without it. */
  readonly status?: string;
  readonly after?: number;
  /** Whether systemd finds the service of the agent running. */
  readonly running?: boolean;
}

/** What the check of the block did: its exit status, its output and the seconds that it took. */
interface Check {
  readonly status: number | null;
  readonly stdout: string;
  readonly seconds: number;
}

/** Runs the step BLOCKS as the runner does, with the folder of the agent in a folder of its own. */
const runCheck = ({
  folder = true,
  downloaded = true,
  status,
  after = 0,
  running = true,
}: Agent): Check => {
  const dir = mkdtempSync(join(tmpdir(), "harden-runner-"));
  try {
    const bin = join(dir, "bin");
    mkdirSync(bin);
    // Forward slashes, which bash takes on every computer.
    const home = join(dir, "agent").replaceAll("\\", "/");
    if (folder) {
      mkdirSync(home);
      if (downloaded) {
        writeFileSync(join(home, "agent"), "");
      }
      if (status !== undefined && after === 0) {
        writeFileSync(join(home, "agent.status"), status);
      }
    }
    const tools = {
      // The clock counts the seconds of the step; the agent writes its status once
      // FAKE_AFTER of them have passed.
      sleep: [
        'echo $(($(cat "$FAKE_CLOCK") + $1)) > "$FAKE_CLOCK"',
        'if [[ -n "$FAKE_STATUS" ]] && (($(cat "$FAKE_CLOCK") >= FAKE_AFTER)); then',
        '  printf %s "$FAKE_STATUS" > "$AGENT_HOME/agent.status"',
        "fi",
      ],
      // Only the question whether the service of the agent runs, as is-active answers it.
      systemctl: [
        '[[ "$*" == "is-active --quiet agent" && "$FAKE_RUNNING" == true ]] || exit 3',
      ],
    };
    for (const [name, script] of Object.entries(tools)) {
      writeFileSync(
        join(bin, name),
        `#!/usr/bin/env bash\n${script.join("\n")}\n`,
      );
      chmodSync(join(bin, name), 0o755);
    }
    const clock = join(dir, "clock");
    writeFileSync(clock, "0\n");
    const script = readWorkflow("e2e.yml").step("gate", BLOCKS).run;
    assert.match(script, /\/home\/agent\//);
    writeFileSync(
      join(dir, "step.sh"),
      script.replaceAll("/home/agent/", '"$AGENT_HOME"/'),
    );
    const result = spawnSync(
      "bash",
      ["--noprofile", "--norc", "-eo", "pipefail", join(dir, "step.sh")],
      {
        encoding: "utf8",
        env: {
          PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
          AGENT_HOME: home,
          FAKE_CLOCK: clock,
          FAKE_STATUS: after === 0 ? "" : (status ?? ""),
          FAKE_AFTER: String(after),
          FAKE_RUNNING: String(running),
        },
      },
    );
    return {
      status: result.status,
      stdout: result.stdout,
      seconds: Number(readFileSync(clock, "utf8")),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

/** The start of the annotation that stops a job without its block. */
const STOP = "::error title=Harden-Runner doesn't block::Harden-Runner";

suite("the check that Harden-Runner blocks", { skip }, () => {
  test("passes at once when the agent stands and runs", () => {
    const check = runCheck({ status: "Initialized" });
    assert.equal(check.status, 0);
    assert.equal(
      check.stdout,
      "Harden-Runner blocks every host that the job doesn't name.\n",
    );
    assert.equal(check.seconds, 0);
  });

  test("waits for an agent that is still starting", () => {
    const check = runCheck({ status: "Initialized", after: 5 });
    assert.equal(check.status, 0, check.stdout);
    assert.equal(check.seconds, 5);
  });

  for (const [why, agent, waits, says] of [
    [
      "Harden-Runner didn't install the agent",
      { folder: false },
      0,
      "didn't install its agent, as StepSecurity said that it is unavailable",
    ],
    [
      "the agent couldn't be downloaded",
      { downloaded: false },
      0,
      "couldn't download its agent, mostly in an outage of GitHub",
    ],
    ["the agent doesn't start", {}, 30, "has an agent that didn't start,"],
    [
      "the status of the agent is an error",
      { status: "Error: the firewall failed" },
      0,
      "has an agent that didn't start,",
    ],
    [
      "the agent stopped",
      { status: "Initialized", running: false },
      0,
      "has an agent that stopped,",
    ],
  ] as const) {
    test(`stops the job when ${why}`, () => {
      const check = runCheck(agent);
      assert.equal(check.status, 1, check.stdout);
      assert.equal(check.seconds, waits, "half a minute at most");
      assert.ok(
        check.stdout.includes(`${STOP} ${says}`),
        `the annotation says why: ${check.stdout}`,
      );
      assert.ok(
        check.stdout.includes(
          `The status of the agent: ${"status" in agent ? agent.status : "none"}\n`,
        ),
        check.stdout,
      );
    });
  }
});
