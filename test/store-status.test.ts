import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  compareVersions,
  type Decision,
  decide,
  escapeData,
  type Input,
  MAX_REVIEW_DAYS,
  parseStatus,
  run,
  type StoreStatus,
  summary,
} from "../scripts/store-status.ts";

const NOW = new Date("2026-10-25T12:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number): Date => new Date(NOW.getTime() - days * DAY_MS);

const NONE = { version: undefined, state: undefined };

const status = (overrides: Partial<StoreStatus> = {}): StoreStatus => ({
  published: { version: "1.0.0", state: "PUBLISHED" },
  submitted: NONE,
  takenDown: false,
  warned: false,
  ...overrides,
});

const input = (overrides: Partial<Input> = {}): Input => ({
  status: status(),
  tag: "v1.1.0",
  explicit: false,
  submittedAt: undefined,
  submittedFrom: undefined,
  now: NOW,
  ...overrides,
});

const pending = (version: string): StoreStatus =>
  status({ submitted: { version, state: "PENDING_REVIEW" } });

const outcome = (decision: Decision) => ({
  deliver: decision.deliver,
  errors: decision.errors.length,
  warnings: decision.warnings.length,
});

// An answer of fetchStatus as the Chrome Web Store API V2 gives it.
const ANSWER = {
  name: "publishers/p/items/i",
  itemId: "i",
  publishedItemRevisionStatus: {
    state: "PUBLISHED",
    distributionChannels: [{ deployPercentage: 100, crxVersion: "0.2.0" }],
  },
  submittedItemRevisionStatus: {
    state: "PENDING_REVIEW",
    distributionChannels: [{ deployPercentage: 100, crxVersion: "0.3.0" }],
  },
  takenDown: false,
  warned: true,
};

test("parseStatus reads the versions, the states and the standing of the item", () => {
  assert.deepEqual(parseStatus(ANSWER), {
    published: { version: "0.2.0", state: "PUBLISHED" },
    submitted: { version: "0.3.0", state: "PENDING_REVIEW" },
    takenDown: false,
    warned: true,
  });
});

test("parseStatus counts a missing or malformed part as none", () => {
  const empty = {
    published: NONE,
    submitted: NONE,
    takenDown: false,
    warned: false,
  };
  assert.deepEqual(parseStatus({}), empty);
  assert.deepEqual(parseStatus(null), empty);
  assert.deepEqual(parseStatus([ANSWER]), empty);
  assert.deepEqual(
    parseStatus({
      publishedItemRevisionStatus: { state: 3, distributionChannels: "0.2.0" },
      submittedItemRevisionStatus: {
        distributionChannels: [{ crxVersion: 3 }],
      },
      takenDown: "true",
    }),
    empty,
  );
  assert.deepEqual(
    parseStatus({
      submittedItemRevisionStatus: { distributionChannels: [null] },
    }).submitted,
    NONE,
  );
});

test("compareVersions orders the numbers of a version, not its text", () => {
  assert.equal(compareVersions("1.2.3", "1.2.3"), 0);
  assert.ok(compareVersions("0.10.0", "0.9.0") > 0);
  assert.ok(compareVersions("0.9.0", "0.10.0") < 0);
  assert.equal(compareVersions("1.2", "1.2.0"), 0);
  assert.ok(compareVersions("1.2.0.1", "1.2") > 0);
});

test("a release that the store lacks goes to the store", () => {
  const decision = decide(input());
  assert.deepEqual(outcome(decision), {
    deliver: true,
    errors: 0,
    warnings: 0,
  });
  assert.deepEqual(decision.notes, [
    "The release v1.1.0 goes to the Chrome Web Store.",
  ]);
  assert.equal(decision.daysInReview, undefined);
});

test("the first release goes to an item that has published nothing yet", () => {
  const decision = decide(input({ status: status({ published: NONE }) }));
  assert.deepEqual(outcome(decision), {
    deliver: true,
    errors: 0,
    warnings: 0,
  });
});

test("a release that the store has published already is not delivered again", () => {
  const decision = decide(input({ tag: "v1.0.0" }));
  assert.deepEqual(outcome(decision), {
    deliver: false,
    errors: 0,
    warnings: 0,
  });
  assert.match(decision.notes[0] ?? "", /has v1\.0\.0 already/);
});

test("a release that the store has staged or published from the submission is not delivered again", () => {
  for (const state of ["STAGED", "PUBLISHED", "PUBLISHED_TO_TESTERS"]) {
    const decision = decide(
      input({ status: status({ submitted: { version: "1.1.0", state } }) }),
    );
    assert.deepEqual(outcome(decision), {
      deliver: false,
      errors: 0,
      warnings: 0,
    });
    assert.match(decision.notes[0] ?? "", new RegExp(`in the state ${state}`));
  }
  const unknown = decide(
    input({
      status: status({ submitted: { version: "1.1.0", state: undefined } }),
    }),
  );
  assert.deepEqual(outcome(unknown), { deliver: true, errors: 0, warnings: 0 });
});

test("a release in review waits for Google with a note, not a failure", () => {
  const decision = decide(
    input({ status: pending("1.1.0"), submittedAt: daysAgo(2) }),
  );
  assert.deepEqual(outcome(decision), {
    deliver: false,
    errors: 0,
    warnings: 0,
  });
  assert.equal(decision.daysInReview, 2);
  assert.match(decision.notes[0] ?? "", /v1\.1\.0 is in review/);
});

test("a new release waits while the store reviews an earlier one", () => {
  const decision = decide(input({ status: pending("1.0.5") }));
  assert.deepEqual(outcome(decision), {
    deliver: false,
    errors: 0,
    warnings: 0,
  });
  assert.equal(decision.daysInReview, undefined);
  assert.match(
    decision.notes[0] ?? "",
    /reviews 1\.0\.5 .* delivers v1\.1\.0 after it/,
  );
  const unnamed = decide(
    input({
      status: status({
        submitted: { version: undefined, state: "PENDING_REVIEW" },
      }),
    }),
  );
  assert.match(unnamed.notes[0] ?? "", /reviews a submission/);
});

test("a review that takes longer than the limit fails the run", () => {
  const limit = decide(
    input({ status: pending("1.1.0"), submittedAt: daysAgo(MAX_REVIEW_DAYS) }),
  );
  assert.equal(limit.errors.length, 0);
  const late = decide(
    input({
      status: pending("1.1.0"),
      submittedAt: daysAgo(MAX_REVIEW_DAYS + 1.5),
    }),
  );
  assert.deepEqual(outcome(late), { deliver: false, errors: 1, warnings: 0 });
  assert.equal(late.daysInReview, MAX_REVIEW_DAYS + 1);
  assert.match(late.errors[0] ?? "", /review of 1\.1\.0 has taken 8 days/);
  const unnamed = decide(
    input({
      status: status({
        submitted: { version: undefined, state: "PENDING_REVIEW" },
      }),
      submittedAt: daysAgo(30),
    }),
  );
  assert.match(
    unnamed.errors[0] ?? "",
    /review of the submission has taken 30 days/,
  );
});

test("a submission from the future counts no days", () => {
  const decision = decide(
    input({ status: pending("1.1.0"), submittedAt: daysAgo(-1) }),
  );
  assert.equal(decision.daysInReview, 0);
});

test("an item that Google took down fails the run and gets nothing", () => {
  const decision = decide(
    input({ status: status({ takenDown: true, warned: true }) }),
  );
  assert.deepEqual(outcome(decision), {
    deliver: false,
    errors: 1,
    warnings: 0,
  });
  assert.match(decision.errors[0] ?? "", /took the item down/);
});

test("a warned item fails the run, and still gets the release that may fix it", () => {
  const decision = decide(input({ status: status({ warned: true }) }));
  assert.deepEqual(outcome(decision), {
    deliver: true,
    errors: 1,
    warnings: 0,
  });
  assert.match(decision.errors[0] ?? "", /warned the item/);
});

test("a rejected release fails the run, and goes again only when given by hand", () => {
  const rejected = status({
    submitted: { version: "1.1.0", state: "REJECTED" },
  });
  const daily = decide(input({ status: rejected }));
  assert.deepEqual(outcome(daily), { deliver: false, errors: 1, warnings: 0 });
  assert.match(daily.errors[0] ?? "", /rejected v1\.1\.0/);
  const byHand = decide(input({ status: rejected, explicit: true }));
  assert.deepEqual(outcome(byHand), { deliver: true, errors: 0, warnings: 0 });
});

test("a cancelled release stays with a note, and goes again only when given by hand", () => {
  const cancelled = status({
    submitted: { version: "1.1.0", state: "CANCELLED" },
  });
  const daily = decide(input({ status: cancelled }));
  assert.deepEqual(outcome(daily), { deliver: false, errors: 0, warnings: 0 });
  assert.match(daily.notes[0] ?? "", /was cancelled/);
  const byHand = decide(input({ status: cancelled, explicit: true }));
  assert.deepEqual(outcome(byHand), { deliver: true, errors: 0, warnings: 0 });
});

test("a new release goes to the store after an earlier one was rejected, with a warning", () => {
  const decision = decide(
    input({
      status: status({ submitted: { version: "1.0.5", state: "REJECTED" } }),
    }),
  );
  assert.deepEqual(outcome(decision), {
    deliver: true,
    errors: 0,
    warnings: 1,
  });
  assert.equal(
    decision.warnings[0],
    "Google rejected the earlier submission 1.0.5; v1.1.0 goes to the review now.",
  );
  const unnamed = decide(
    input({
      status: status({ submitted: { version: undefined, state: "REJECTED" } }),
    }),
  );
  assert.equal(
    unnamed.warnings[0],
    "Google rejected the earlier submission; v1.1.0 goes to the review now.",
  );
});

test("a release below the version of the store fails the run, as the store would refuse it", () => {
  const decision = decide(input({ tag: "v0.9.0", explicit: true }));
  assert.deepEqual(outcome(decision), {
    deliver: false,
    errors: 1,
    warnings: 0,
  });
  assert.match(
    decision.errors[0] ?? "",
    /has 1\.0\.0, a higher version than v0\.9\.0/,
  );
});

test("the summary shows the versions, the review and the standing of the item", () => {
  const delivered = input();
  const text = summary(delivered, decide(delivered));
  assert.match(text, /^### The Chrome Web Store\n/);
  assert.match(text, /\| Release \| v1\.1\.0 \|/);
  assert.match(text, /\| Published \| 1\.0\.0 \(PUBLISHED\) \|/);
  assert.match(text, /\| Submitted \| none \|/);
  assert.match(text, /\| Review \| no review pending \|/);
  assert.match(text, /\| Item \| in good standing \|/);
  assert.match(
    text,
    /- The release v1\.1\.0 goes to the Chrome Web Store\.\n$/,
  );
  assert.doesNotMatch(text, /How to fix/);
});

test("the summary counts the days of a review and says since when", () => {
  const one = input({
    status: pending("1.1.0"),
    submittedAt: new Date("2026-10-24T06:00:00Z"),
    submittedFrom: "delivery",
  });
  assert.match(
    summary(one, decide(one)),
    /\| Review \| pending for 1 day, since the delivery on 2026-10-24 \|/,
  );
  const many = input({
    status: pending("1.1.0"),
    submittedAt: new Date("2026-10-20T06:00:00Z"),
    submittedFrom: "release",
  });
  assert.match(
    summary(many, decide(many)),
    /pending for 5 days, since the release on 2026-10-20 \|/,
  );
  const unknown = input({ status: pending("1.1.0") });
  assert.match(
    summary(unknown, decide(unknown)),
    /pending, since an unknown day \|/,
  );
  const noDays = input({ status: pending("1.1.0"), submittedAt: daysAgo(1) });
  assert.match(
    summary(noDays, { ...decide(noDays), daysInReview: undefined }),
    /pending, since an unknown day/,
  );
});

test("the summary names each problem with the way to fix it", () => {
  const down = input({
    status: status({
      takenDown: true,
      submitted: { version: "1.1.0", state: undefined },
    }),
  });
  const text = summary(down, decide(down));
  assert.match(text, /\| Submitted \| 1\.1\.0 \(unknown\) \|/);
  assert.match(text, /\| Item \| taken down \|/);
  assert.match(text, /- \*\*Problem:\*\* Google took the item down/);
  assert.match(text, /releases\.html#when-a-run-fails/);
  const warned = input({
    status: status({
      warned: true,
      submitted: { version: "1.0.5", state: "REJECTED" },
    }),
  });
  const warnedText = summary(warned, decide(warned));
  assert.match(warnedText, /\| Item \| warned \|/);
  assert.match(
    warnedText,
    /- \*\*Warning:\*\* Google rejected the earlier submission 1\.0\.5/,
  );
});

test("escapeData keeps a message on the one line of a workflow command", () => {
  assert.equal(escapeData("100% done\r\nnext"), "100%25 done%0D%0Anext");
});

const withFiles = (
  body: (dir: string, env: Record<string, string>) => void,
  answer: unknown = ANSWER,
): void => {
  const dir = mkdtempSync(join(tmpdir(), "store-status-"));
  try {
    writeFileSync(join(dir, "status.json"), JSON.stringify(answer));
    writeFileSync(join(dir, "output"), "");
    writeFileSync(join(dir, "summary"), "");
    body(dir, {
      STATUS: join(dir, "status.json"),
      GITHUB_OUTPUT: join(dir, "output"),
      GITHUB_STEP_SUMMARY: join(dir, "summary"),
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test("run hands the tag to the next job when the release goes to the store", () => {
  const answer = {
    ...ANSWER,
    warned: false,
    submittedItemRevisionStatus: undefined,
  };
  withFiles((dir, files) => {
    const lines: string[] = [];
    const code = run({ ...files, TAG: "v0.3.0" }, NOW, (line) =>
      lines.push(line),
    );
    assert.equal(code, 0);
    assert.equal(readFileSync(join(dir, "output"), "utf8"), "tag=v0.3.0\n");
    assert.match(
      readFileSync(join(dir, "summary"), "utf8"),
      /\| Published \| 0\.2\.0/,
    );
    assert.deepEqual(lines, [
      "The release v0.3.0 goes to the Chrome Web Store.",
    ]);
  }, answer);
});

test("run fails with an annotation for each problem and hands on no tag in review", () => {
  withFiles((dir, files) => {
    const lines: string[] = [];
    const code = run(
      {
        ...files,
        TAG: "v0.3.0",
        SUBMITTED_AT: "2026-10-10T08:00:00Z",
        SUBMITTED_FROM: "delivery",
      },
      NOW,
      (line) => lines.push(line),
    );
    assert.equal(code, 1);
    assert.equal(readFileSync(join(dir, "output"), "utf8"), "");
    assert.equal(lines.length, 3);
    assert.match(
      lines[0] ?? "",
      /^::error title=Chrome Web Store::Google warned/,
    );
    assert.match(
      lines[1] ?? "",
      /^::error title=Chrome Web Store::The review of 0\.3\.0 has taken 15 days/,
    );
    assert.match(
      readFileSync(join(dir, "summary"), "utf8"),
      /pending for 15 days, since the delivery on 2026-10-10/,
    );
  });
});

test("run writes a warning and ignores a time or a source it can't read", () => {
  const answer = {
    ...ANSWER,
    warned: false,
    submittedItemRevisionStatus: {
      state: "REJECTED",
      distributionChannels: [{ crxVersion: "0.2.5" }],
    },
  };
  withFiles((dir, files) => {
    const lines: string[] = [];
    const code = run(
      {
        ...files,
        TAG: "v0.3.0",
        EXPLICIT: "true",
        SUBMITTED_AT: "never",
        SUBMITTED_FROM: "dashboard",
      },
      NOW,
      (line) => lines.push(line),
    );
    assert.equal(code, 0);
    assert.match(
      lines[0] ?? "",
      /^::warning title=Chrome Web Store::Google rejected the earlier submission 0\.2\.5/,
    );
    assert.equal(readFileSync(join(dir, "output"), "utf8"), "tag=v0.3.0\n");
  }, answer);
});

test("run names a variable that the workflow didn't set", () => {
  withFiles((_dir, files) => {
    assert.throws(
      () => run({ ...files }, NOW, () => {}),
      /The variable TAG is missing\./,
    );
  });
});

test("the workflow runs the file itself, which writes the report", () => {
  withFiles((dir, files) => {
    const script = fileURLToPath(
      new URL("../scripts/store-status.ts", import.meta.url),
    );
    const result = spawnSync(process.execPath, [script], {
      env: { ...process.env, ...files, TAG: "v0.2.0" },
      encoding: "utf8",
    });
    assert.equal(result.status, 1, result.stderr);
    assert.match(
      result.stdout,
      /::error title=Chrome Web Store::Google warned/,
    );
    assert.match(
      readFileSync(join(dir, "summary"), "utf8"),
      /### The Chrome Web Store/,
    );
  });
});
