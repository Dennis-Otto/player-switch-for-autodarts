import assert from "node:assert/strict";
import { test } from "node:test";

import {
  badge,
  type Health,
  isOverdue,
  looksLikeSignInChanged,
  NO_HEALTH,
  nextRunAt,
  parseHealth,
  planStart,
  REFRESH_PERIOD_MINUTES,
  REFRESH_PERIOD_MS,
  RETRY_MS,
  recordRun,
  renewedAgo,
  suggestsUpdate,
} from "../src/health.ts";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
// A clock that stands still, on a day in October.
const NOW = Date.UTC(2026, 9, 24, 20, 0);

const ranAt = (lastRefreshAt: number | null, suspectedChange = false): Health => ({ lastRefreshAt, suspectedChange });

test("the period of the alarm and the one of the clock agree", () => {
  assert.equal(REFRESH_PERIOD_MS, REFRESH_PERIOD_MINUTES * MINUTE);
  assert.equal(REFRESH_PERIOD_MS, 12 * HOUR);
});

test("parseHealth reads a stored record", () => {
  assert.deepEqual(parseHealth({ lastRefreshAt: 5, suspectedChange: true }), ranAt(5, true));
});

test("parseHealth starts afresh from anything it doesn't recognise", () => {
  assert.deepEqual(parseHealth(undefined), NO_HEALTH);
  assert.deepEqual(parseHealth(null), NO_HEALTH);
  assert.deepEqual(parseHealth("health"), NO_HEALTH);
  assert.deepEqual(parseHealth({ lastRefreshAt: "yesterday", suspectedChange: "yes" }), NO_HEALTH);
  assert.deepEqual(parseHealth({ lastRefreshAt: Number.NaN }), NO_HEALTH);
  assert.deepEqual(parseHealth({ lastRefreshAt: Number.POSITIVE_INFINITY }), NO_HEALTH);
});

test("a renewal that never ran is overdue", () => {
  assert.equal(isOverdue(NO_HEALTH, NOW), true);
});

test("a renewal is overdue exactly one period after the last run", () => {
  assert.equal(isOverdue(ranAt(NOW - REFRESH_PERIOD_MS + 1), NOW), false);
  assert.equal(isOverdue(ranAt(NOW - REFRESH_PERIOD_MS), NOW), true);
  assert.equal(isOverdue(ranAt(NOW - 3 * DAY), NOW), true);
});

test("a last run ahead of the clock counts as overdue, since its time can't be trusted", () => {
  assert.equal(isOverdue(ranAt(NOW + MINUTE), NOW), true);
});

test("after a browser restart without the alarm, it is made anew for when the next run is due", () => {
  assert.deepEqual(planStart(false, ranAt(NOW - 2 * HOUR), NOW), {
    alarmAt: NOW - 2 * HOUR + REFRESH_PERIOD_MS,
    refreshNow: false,
  });
});

test("a computer that was off when the renewal was due catches up at once", () => {
  assert.deepEqual(planStart(true, ranAt(NOW - 2 * DAY), NOW), { alarmAt: null, refreshNow: true });
});

test("without the alarm and overdue, the renewal runs now and the alarm a period later", () => {
  assert.deepEqual(planStart(false, ranAt(NOW - 2 * DAY), NOW), { alarmAt: NOW + REFRESH_PERIOD_MS, refreshNow: true });
  assert.deepEqual(planStart(false, NO_HEALTH, NOW), { alarmAt: NOW + REFRESH_PERIOD_MS, refreshNow: true });
});

test("a start with the alarm in place and a recent run changes nothing", () => {
  assert.deepEqual(planStart(true, ranAt(NOW - HOUR), NOW), { alarmAt: null, refreshNow: false });
});

test("every parked account turned away in one run hints at a change at Autodarts", () => {
  assert.equal(looksLikeSignInChanged({ renewed: 0, rejected: 2, unreachable: 0 }), true);
  assert.equal(looksLikeSignInChanged({ renewed: 0, rejected: 5, unreachable: 0 }), true);
});

test("one account turned away, or some still renewed or unasked, is no such hint", () => {
  assert.equal(looksLikeSignInChanged({ renewed: 0, rejected: 1, unreachable: 0 }), false);
  assert.equal(looksLikeSignInChanged({ renewed: 1, rejected: 3, unreachable: 0 }), false);
  assert.equal(looksLikeSignInChanged({ renewed: 0, rejected: 3, unreachable: 1 }), false);
  assert.equal(looksLikeSignInChanged({ renewed: 0, rejected: 0, unreachable: 0 }), false);
});

test("a run that reached Autodarts for everyone moves the time on", () => {
  assert.deepEqual(recordRun(ranAt(1), { renewed: 2, rejected: 0, unreachable: 0 }, NOW), ranAt(NOW));
  assert.deepEqual(recordRun(ranAt(1), { renewed: 0, rejected: 0, unreachable: 0 }, NOW), ranAt(NOW));
});

test("a run without a network for an account keeps the old time, so the next start catches up", () => {
  assert.deepEqual(recordRun(ranAt(1), { renewed: 1, rejected: 0, unreachable: 1 }, NOW), ranAt(1));
  assert.deepEqual(recordRun(NO_HEALTH, { renewed: 0, rejected: 0, unreachable: 2 }, NOW), NO_HEALTH);
});

test("a run that turns everyone away records the suspicion of a change", () => {
  assert.deepEqual(recordRun(ranAt(1), { renewed: 0, rejected: 2, unreachable: 0 }, NOW), ranAt(NOW, true));
});

test("a run that renews an account clears the suspicion", () => {
  assert.deepEqual(recordRun(ranAt(1, true), { renewed: 1, rejected: 1, unreachable: 0 }, NOW), ranAt(NOW));
});

test("a run with nobody to renew leaves the suspicion as it was", () => {
  assert.deepEqual(recordRun(ranAt(1, true), { renewed: 0, rejected: 0, unreachable: 0 }, NOW), ranAt(NOW, true));
  assert.deepEqual(recordRun(ranAt(1, true), { renewed: 0, rejected: 1, unreachable: 0 }, NOW), ranAt(NOW, true));
});

test("the next run comes a period later, or soon when an account could not be asked", () => {
  assert.equal(nextRunAt({ renewed: 2, rejected: 1, unreachable: 0 }, NOW), NOW + REFRESH_PERIOD_MS);
  assert.equal(nextRunAt({ renewed: 2, rejected: 0, unreachable: 1 }, NOW), NOW + RETRY_MS);
  assert.ok(RETRY_MS < REFRESH_PERIOD_MS);
});

const ada = { name: "Ada", needsSignIn: false };
const bob = { name: "Bob", needsSignIn: true };
const cy = { name: "Cy", needsSignIn: true };

test("the badge is empty while nobody has to sign in again", () => {
  assert.deepEqual(badge([], "en"), { text: "", names: "" });
  assert.deepEqual(badge([ada], "en"), { text: "", names: "" });
});

test("the badge counts the accounts that have to sign in again and names them", () => {
  assert.deepEqual(badge([ada, bob], "en"), { text: "1", names: "Bob" });
  assert.deepEqual(badge([ada, bob, cy], "en"), { text: "2", names: "Bob and Cy" });
  assert.deepEqual(badge([bob, cy], "de"), { text: "2", names: "Bob und Cy" });
});

test("the badge stays short with many accounts", () => {
  const many = Array.from({ length: 10 }, (_, index) => ({ name: `P${index}`, needsSignIn: true }));
  assert.equal(badge(many.slice(0, 9), "en").text, "9");
  assert.equal(badge(many, "en").text, "9+");
});

test("the popup suggests an update only while a suspected change still locks someone out", () => {
  assert.equal(suggestsUpdate(ranAt(NOW, true), [ada, bob]), true);
  assert.equal(suggestsUpdate(ranAt(NOW, true), [ada]), false);
  assert.equal(suggestsUpdate(ranAt(NOW, false), [ada, bob]), false);
});

test("renewedAgo says in minutes how long ago a session was renewed within the hour", () => {
  assert.equal(renewedAgo(NOW, NOW, "en"), "this minute");
  assert.equal(renewedAgo(NOW - 59 * 1000, NOW, "en"), "this minute");
  assert.equal(renewedAgo(NOW - 5 * MINUTE, NOW, "en"), "5 minutes ago");
  assert.equal(renewedAgo(NOW - 59 * MINUTE, NOW, "de"), "vor 59 Minuten");
});

test("renewedAgo says it in hours for up to two days", () => {
  assert.equal(renewedAgo(NOW - HOUR, NOW, "en"), "1 hour ago");
  assert.equal(renewedAgo(NOW - 3 * HOUR - 20 * MINUTE, NOW, "en"), "3 hours ago");
  assert.equal(renewedAgo(NOW - 3 * HOUR, NOW, "de"), "vor 3 Stunden");
  assert.equal(renewedAgo(NOW - 47 * HOUR, NOW, "en"), "47 hours ago");
});

test("renewedAgo says it in days after that", () => {
  assert.equal(renewedAgo(NOW - 2 * DAY, NOW, "en"), "2 days ago");
  assert.equal(renewedAgo(NOW - 9 * DAY, NOW, "de"), "vor 9 Tagen");
});

test("renewedAgo counts a time ahead of the clock as now", () => {
  assert.equal(renewedAgo(NOW + HOUR, NOW, "en"), "this minute");
});
