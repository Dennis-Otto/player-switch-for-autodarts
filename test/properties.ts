/**
 * The settings of fast-check for the property-based tests, the `*.property.test.ts`
 * files, which import this file. Each property runs on 100 generated inputs in
 * every test run; FAST_CHECK_RUNS asks for more, as in `FAST_CHECK_RUNS=10000 npm test`.
 * A failure prints its seed and path. FAST_CHECK_SEED with FAST_CHECK_PATH replays
 * exactly the failing input; the seed alone replays the same runs from the start and
 * stops at the run count, so give it with the FAST_CHECK_RUNS of the failing run.
 */
import fc from "fast-check";

function setting(name: string): number | undefined {
  const value = process.env[name];
  return value !== undefined && /^-?\d+$/.test(value)
    ? Number(value)
    : undefined;
}

const runs = setting("FAST_CHECK_RUNS");
const seed = setting("FAST_CHECK_SEED");
const path = process.env.FAST_CHECK_PATH;
fc.configureGlobal({
  ...(runs !== undefined && runs > 0 ? { numRuns: runs } : {}),
  ...(seed !== undefined ? { seed } : {}),
  ...(seed !== undefined && path !== undefined && /^\d+(:\d+)*$/.test(path)
    ? { path }
    : {}),
});
