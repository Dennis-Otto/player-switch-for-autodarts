/**
 * The settings of fast-check for the property-based tests, the `*.property.test.ts`
 * files, which import this file. Each property runs on 100 generated inputs in
 * every test run; FAST_CHECK_RUNS asks for more, as in `FAST_CHECK_RUNS=10000 npm test`,
 * and FAST_CHECK_SEED repeats the inputs of the seed that a failure prints.
 */
import fc from "fast-check";

function setting(name: string): number | undefined {
  const value = process.env[name];
  return value !== undefined && /^-?\d+$/.test(value) ? Number(value) : undefined;
}

const runs = setting("FAST_CHECK_RUNS");
const seed = setting("FAST_CHECK_SEED");
fc.configureGlobal({
  ...(runs !== undefined && runs > 0 ? { numRuns: runs } : {}),
  ...(seed !== undefined ? { seed } : {}),
});
