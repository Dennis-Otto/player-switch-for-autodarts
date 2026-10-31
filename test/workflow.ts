/**
 * A workflow of `.github/workflows/` for the tests of its steps. They read it line by
 * line: no YAML parser is among the packages, and a step's script and environment are
 * lines that a test can take as they are.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** A step of a job: its condition, its time limit, its environment and its script. */
export interface Step {
  readonly if: string | undefined;
  readonly timeoutMinutes: string | undefined;
  readonly env: string;
  readonly run: string;
}

export interface Workflow {
  /** The whole file, with LF line endings on every computer. */
  readonly text: string;
  /** The lines of a job, from its key to the key of the next job. */
  readonly jobLines: (job: string) => string[];
  /** A step of a job, by its name. */
  readonly step: (job: string, name: string) => Step;
}

export const readWorkflow = (file: string): Workflow => {
  const text = readFileSync(
    fileURLToPath(new URL(`../.github/workflows/${file}`, import.meta.url)),
    "utf8",
  ).replaceAll("\r\n", "\n");
  const lines = text.split("\n");

  const jobLines = (job: string): string[] => {
    const start = lines.indexOf(`  ${job}:`);
    assert.notEqual(start, -1, `the workflow has a job "${job}"`);
    const end = lines.findIndex(
      (line, index) => index > start && /^ {2}\S/.test(line),
    );
    return lines.slice(start, end === -1 ? undefined : end);
  };

  const step = (job: string, name: string): Step => {
    const inJob = jobLines(job);
    const start = inJob.indexOf(`      - name: ${name}`);
    assert.notEqual(start, -1, `the job "${job}" has a step "${name}"`);
    const end = inJob.findIndex(
      (line, index) => index > start && /^ {6}- /.test(line),
    );
    const body = inJob.slice(start + 1, end === -1 ? undefined : end);
    /** The value of a key of the step that stays on the line of its key. */
    const value = (key: string): string | undefined =>
      body
        .find((line) => line.startsWith(`        ${key}: `))
        ?.slice(`        ${key}: `.length);
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
    return {
      if: value("if"),
      timeoutMinutes: value("timeout-minutes"),
      env: block("env").join("\n"),
      run: `${block("run")
        .map((line) => line.slice(10))
        .join("\n")
        .trimEnd()}\n`,
    };
  };

  return { text, jobLines, step };
};
