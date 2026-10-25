import assert from "node:assert/strict";
import { test } from "node:test";

import type { Identity } from "../src/autodarts.ts";
import { REFRESH_PERIOD_MINUTES, RETRY_MS } from "../src/health.ts";
import type { PlayersView, VenueAccount } from "../src/messages.ts";
import { SETTINGS_KEY } from "../src/page.ts";
import {
  EMPTY,
  find,
  park,
  type State,
  setActive,
  startAdding,
} from "../src/state.ts";
import { ACCOUNTS_KEY } from "../src/storage.ts";
import { ADD_WINDOW_MS } from "../src/switch.ts";
import { PLAY_URL } from "../src/tabs.ts";
import {
  ACTIVITY_KEY,
  hashPin,
  LOCKOUT_KEY,
  MAX_FAILURES,
  type PinHash,
  VENUE_KEY,
} from "../src/venue.ts";
import {
  BADGE_COLORS,
  BADGE_TEXT_COLOR,
  HEALTH_KEY,
  IDLE_ALARM,
  PICK_UP_DELAYS_MS,
  REFRESH_ALARM,
  REQUEST_TIMEOUT_MS,
  SAVED_BADGE_MS,
  SAVED_COLOR,
} from "../src/worker.ts";
import {
  EXTENSION_ID,
  FakeBrowser,
  PLAY,
  POPUP,
  SWITCHER,
  settle,
  until,
} from "./browser.ts";
import { counting } from "./helpers.ts";

const ada: Identity = {
  id: "ada",
  username: "ada",
  name: "ada",
  picture: null,
};
const bob: Identity = {
  id: "bob",
  username: "bob",
  name: "bob",
  picture: null,
};
const MATCH = "https://play.autodarts.com/matches/42";
const MINUTE = 60_000;

/** A browser whose renewal ran just now, so that the start of the worker renews nothing. */
function browser(): FakeBrowser {
  const fake = new FakeBrowser();
  fake.local.data.set(HEALTH_KEY, {
    lastRefreshAt: fake.clock,
    lastAttemptAt: fake.clock,
    suspectedChange: false,
  });
  fake.alarmsSet.set(REFRESH_ALARM, {});
  return fake;
}

/** Ada plays on the page, and Bob's session is parked. */
async function twoPlayers(
  fake: FakeBrowser,
  extra: (state: State) => State = (s) => s,
) {
  fake.pageToken = fake.autodarts.issue("ada");
  const parked = park(
    setActive(EMPTY, ada),
    bob,
    fake.autodarts.issue("bob"),
    fake.clock,
  );
  await fake.seed(extra(parked));
}

/** Starts the worker and waits for the check of its start. */
async function started(fake: FakeBrowser) {
  await fake.start().ready;
  await settle();
}

/** Any answer to a request of the popup, with each of its fields that a test reads. */
interface Reply {
  ok?: boolean;
  reason?: string;
  pin?: string;
  wrong?: boolean;
  retryIn?: number;
  page?: boolean;
  saved?: string;
  error?: string;
  view: PlayersView;
}

/** Any answer to a request of the options page. */
interface Venue {
  ok?: boolean;
  reason?: string;
  pin?: string;
  error?: string;
  status: {
    manager: boolean;
    idleMinutes: number | null;
    house: string | null;
    accounts: VenueAccount[];
  } | null;
}

/** A request of the popup, and its answer. */
async function popup(
  fake: FakeBrowser,
  message: Record<string, unknown>,
  sender: object = { id: EXTENSION_ID, url: POPUP },
): Promise<Reply> {
  const { handled, reply } = await fake.send(
    { type: "popup", ...message },
    sender,
  );
  assert.equal(handled, true, JSON.stringify(message));
  return reply as Reply;
}

async function venue(
  fake: FakeBrowser,
  message: Record<string, unknown>,
): Promise<Venue> {
  const { handled, reply } = await fake.send({ type: "venue", ...message });
  assert.equal(handled, true);
  return reply as Venue;
}

/** A hash of a PIN that is quick to check, as a stored one may be. */
const quickHash = (pin: string): Promise<PinHash> => hashPin(pin, crypto, 1);

async function accounts(fake: FakeBrowser): Promise<State> {
  return fake.store().load();
}

test("the worker keeps the accounts from the content scripts and sets the color of the badge text", async () => {
  const fake = browser();
  await started(fake);
  assert.equal(fake.local.accessLevel, "TRUSTED_CONTEXTS");
  assert.equal(fake.badge.textColor, BADGE_TEXT_COLOR);
  assert.deepEqual(fake.logs, []);
});

test("a browser that can't keep the storage from the content scripts leaves a trace, and an old one without a badge text color still starts", async () => {
  const fake = browser();
  fake.local.setAccessLevel = undefined;
  fake.action.setBadgeTextColor = undefined;
  await started(fake);
  assert.deepEqual(fake.logs, [
    "Player Switch: keeping the saved accounts from the Autodarts page failed.",
  ]);

  const failing = browser();
  failing.action.setBadgeTextColor = () => Promise.reject(new Error("old"));
  await started(failing);
  assert.deepEqual(failing.logs, []);
});

test("a start without the alarm and a renewal long ago renews the parked sessions and sets the alarm", async () => {
  const fake = new FakeBrowser();
  await twoPlayers(fake);
  const bobBefore = find(await accounts(fake), "bob")?.token;
  await started(fake);

  assert.deepEqual(fake.autodarts.refreshes, [bobBefore]);
  const health = fake.local.data.get(HEALTH_KEY) as { lastRefreshAt: number };
  assert.equal(health.lastRefreshAt, fake.clock);
  assert.deepEqual(fake.alarmsSet.get(REFRESH_ALARM), {
    when: fake.clock + REFRESH_PERIOD_MINUTES * MINUTE,
    periodInMinutes: REFRESH_PERIOD_MINUTES,
  });
  // The badge is back, with nobody who has to sign in again.
  assert.equal(fake.badge.title, "extName");
  assert.equal(fake.badge.color, BADGE_COLORS.none);
});

test("a start that tried a moment ago sets the alarm for the retry and renews nothing", async () => {
  const fake = new FakeBrowser();
  fake.local.data.set(HEALTH_KEY, {
    lastRefreshAt: null,
    lastAttemptAt: fake.clock - MINUTE,
    suspectedChange: false,
  });
  await twoPlayers(fake);
  await started(fake);
  assert.deepEqual(fake.autodarts.refreshes, []);
  assert.equal(
    fake.alarmsSet.get(REFRESH_ALARM)?.when,
    fake.clock - MINUTE + RETRY_MS,
  );
});

test("the renewal runs once however often the browser wakes the worker, and a failure of the start leaves a trace", async () => {
  const fake = browser();
  const worker = fake.start();
  fake.runtime.onStartup.fire();
  fake.runtime.onInstalled.fire({ reason: "chrome_update" });
  await worker.ready;
  assert.deepEqual(fake.opened, []);
  assert.deepEqual(fake.injected, []);

  const broken = browser();
  broken.broken.add("alarms.get");
  await started(broken);
  assert.deepEqual(broken.logs, [
    "Player Switch: the check of the renewal at the start failed.",
  ]);
});

test("the alarm renews the parked sessions, and two alarms close together share one run", async () => {
  const fake = browser();
  await twoPlayers(fake);
  await started(fake);
  fake.alarms.onAlarm.fire({ name: REFRESH_ALARM });
  fake.alarms.onAlarm.fire({ name: REFRESH_ALARM });
  fake.alarms.onAlarm.fire({ name: "something-else" });
  await until(() => fake.autodarts.refreshes.length === 1, "the renewal");
  await settle();
  assert.equal(fake.autodarts.refreshes.length, 1);
  assert.equal(fake.autodarts.reuses, 0);

  fake.local.failing.set = true;
  fake.alarms.onAlarm.fire({ name: REFRESH_ALARM });
  await until(() => fake.logs.length > 0, "the trace");
  assert.ok(
    fake.logs.includes(
      "Player Switch: the renewal of the parked sessions failed.",
    ),
  );
});

test("Autodarts gets at most 20 seconds for a request", async () => {
  const fake = browser();
  await twoPlayers(fake);
  const signals: (AbortSignal | null | undefined)[] = [];
  const platform = fake.platform();
  const fetcher = counting((url, init) => {
    signals.push(init.signal);
    return fake.autodarts.fetch(url, init);
  });
  const { startWorker } = await import("../src/worker.ts");
  await startWorker(fake, { ...platform, fetch: fetcher }).ready;
  fake.alarms.onAlarm.fire({ name: REFRESH_ALARM });
  await until(() => fetcher.calls === 1, "the request");
  assert.ok(signals[0] instanceof AbortSignal);
  assert.equal(REQUEST_TIMEOUT_MS, 20_000);
});

test("the install waits for the first account, opens the welcome page and gives the open Autodarts tabs the content script", async () => {
  const fake = browser();
  await started(fake);
  const tab = fake.addTab({ answers: false });
  fake.runtime.onInstalled.fire({ reason: "install" });
  await until(() => fake.opened.length === 1, "the welcome page");

  assert.deepEqual(fake.opened, [
    `chrome-extension://${EXTENSION_ID}/welcome.html`,
  ]);
  assert.ok(fake.injected.includes(tab.id));
  assert.equal(tab.answers, true);
  const state = await accounts(fake);
  assert.equal(state.addingUntil, fake.clock + ADD_WINDOW_MS);
});

test("an update seals the accounts in the format of this version and gives the open tabs the new script, without a welcome", async () => {
  const fake = browser();
  await twoPlayers(fake);
  await started(fake);
  const tab = fake.addTab({ blocked: true, answers: false });
  fake.runtime.onInstalled.fire({ reason: "update" });
  await until(() => fake.injected.includes(tab.id), "the injection");
  await settle();
  assert.deepEqual(fake.opened, []);
  assert.deepEqual(fake.logs, []);
});

test("failures of an install or an update leave a trace", async () => {
  const fake = browser();
  await started(fake);
  fake.broken.add("tabs.query");
  fake.local.failing.get = true;
  fake.runtime.onInstalled.fire({ reason: "install" });
  fake.runtime.onInstalled.fire({ reason: "update" });
  await until(() => fake.logs.length >= 3, "the traces");
  assert.deepEqual(
    new Set(fake.logs),
    new Set([
      "Player Switch: adding the button to the open Autodarts tabs failed.",
      "Player Switch: the welcome failed.",
      "Player Switch: bringing the saved accounts up to date failed.",
    ]),
  );
});

test("the worker answers only messages of its own extension of a shape it knows", async () => {
  const fake = browser();
  await started(fake);
  for (const [message, sender] of [
    [
      { type: "popup", action: "view" },
      { id: "another-extension", url: POPUP },
    ],
    [
      { type: "popup", action: "steal" },
      { id: EXTENSION_ID, url: POPUP },
    ],
    [null, { id: EXTENSION_ID, url: POPUP }],
  ] as const) {
    assert.deepEqual(await fake.send(message, sender), {
      handled: false,
      reply: undefined,
    });
  }
});

test("the content script may ask what its button shows, but never sees or changes the accounts", async () => {
  const fake = browser();
  await twoPlayers(fake);
  await started(fake);
  const tab = fake.addTab();
  const content = { id: EXTENSION_ID, url: PLAY, tab };
  for (const message of [
    { type: "popup", action: "view" },
    { type: "popup", action: "removeAccount", id: "ada" },
    { type: "venue", action: "status" },
    { type: "switcher", action: "close" },
  ]) {
    assert.equal((await fake.send(message, content)).handled, false);
  }
  assert.equal((await accounts(fake)).profiles.length, 2);
  assert.ok(
    !fake.told.some(({ message }) => message.action === "closeSwitcher"),
  );

  const { handled, reply } = await fake.send({ type: "button" }, content);
  assert.equal(handled, true);
  assert.deepEqual(reply, {
    settings: { showButton: true, corner: "bottom-right" },
    player: { name: "ada", picture: null, initial: "A" },
    reportActivity: false,
  });
});

test("a button that the worker can't read the accounts for is answered with nothing", async () => {
  const fake = browser();
  await started(fake);
  fake.local.failing.get = true;
  assert.deepEqual(
    await fake.send({ type: "button" }, { id: EXTENSION_ID, url: PLAY }),
    {
      handled: true,
      reply: null,
    },
  );
});

test("the view of the popup says when no Autodarts tab answers", async () => {
  const fake = browser();
  await twoPlayers(fake);
  await started(fake);
  const reply = await popup(fake, { action: "view" });
  assert.equal("error" in reply, false);
  assert.deepEqual(
    { ok: reply.ok, page: reply.page },
    { ok: true, page: false },
  );
  assert.deepEqual(
    reply.view.profiles.map((profile) => [
      profile.id,
      profile.active,
      profile.pin,
    ]),
    [
      ["ada", true, false],
      ["bob", false, false],
    ],
  );
  assert.deepEqual(reply.view.venue, { manager: false });
  assert.equal(reply.view.updateHint, false);
});

test("the view of the popup saves a new account that signed in while one is being added, and ends a session the page lost", async () => {
  const fake = browser();
  // Ada's session is parked, and the page waits for a new account.
  await fake.seed(
    startAdding(
      park(EMPTY, ada, fake.autodarts.issue("ada"), fake.clock),
      fake.clock + ADD_WINDOW_MS,
    ),
  );
  fake.addTab();
  await started(fake);
  fake.pageToken = fake.autodarts.issue("bob");
  const saved = await popup(fake, { action: "view" });
  assert.equal(saved.saved, "bob");
  assert.equal(saved.page, true);

  fake.pageToken = null;
  const lost = await popup(fake, { action: "view" });
  assert.equal(lost.page, true);
  assert.equal((await accounts(fake)).activeId, null);
});

test("a tap on a tile switches players in the tab of the switcher, and parks the session of the one before", async () => {
  const fake = browser();
  await twoPlayers(fake);
  await started(fake);
  const other = fake.addTab({ active: false });
  const tab = fake.addTab();
  const reply = await popup(
    fake,
    { action: "switch", id: "bob" },
    {
      id: EXTENSION_ID,
      url: SWITCHER,
      tab,
    },
  );

  assert.deepEqual(
    { ok: reply.ok, page: reply.page },
    { ok: true, page: true },
  );
  const state = await accounts(fake);
  assert.equal(state.activeId, "bob");
  assert.ok(find(state, "ada")?.token);
  assert.equal(
    fake.told.find(({ message }) => message.action === "write")?.tabId,
    tab.id,
  );
  assert.ok(fake.reloaded.includes(other.id));
  // A tap in the switcher is an input at the display, too.
  assert.equal(fake.sessionArea.data.get(ACTIVITY_KEY), fake.clock);
});

test("a switch says when Autodarts can't be reached and when the account has to sign in again", async () => {
  const fake = browser();
  await twoPlayers(fake);
  fake.addTab();
  await started(fake);
  fake.broken.add("fetch");
  const unreachable = await popup(fake, { action: "switch", id: "bob" });
  assert.deepEqual(
    [unreachable.reason, unreachable.page],
    ["unreachable", true],
  );
  fake.broken.delete("fetch");
  fake.autodarts.live.clear();
  const rejected = await popup(fake, { action: "switch", id: "bob" });
  assert.equal(rejected.reason, "signin");
});

test("with no Autodarts tab, a switch opens one, goes on there and shows it", async () => {
  const fake = browser();
  await twoPlayers(fake);
  await started(fake);
  const reply = await popup(fake, { action: "switch", id: "bob" });
  assert.equal(reply.ok, true);
  assert.deepEqual(fake.opened, [PLAY_URL]);
  assert.equal(fake.focused.length, 1);
  assert.equal((await accounts(fake)).activeId, "bob");
});

test("a switch or a sign-out during a match asks first, and spends no token before the yes", async () => {
  const fake = browser();
  await twoPlayers(fake);
  fake.addTab({ url: MATCH });
  await started(fake);
  const before = fake.autodarts.refreshes.length;

  const asked = await popup(fake, { action: "switch", id: "bob" });
  assert.deepEqual(asked.reason, "match");
  assert.equal(
    ((await popup(fake, { action: "signout" })) as { reason?: string }).reason,
    "match",
  );
  assert.equal(fake.autodarts.refreshes.length, before);

  const yes = await popup(fake, {
    action: "switch",
    id: "bob",
    confirmed: true,
  });
  assert.equal(yes.ok, true);
});

test("the tabs that the browser can't list don't stop a switch", async () => {
  const fake = browser();
  await twoPlayers(fake);
  const tab = fake.addTab();
  await started(fake);
  fake.broken.add("tabs.query.once");
  const reply = await popup(
    fake,
    { action: "switch", id: "bob" },
    {
      id: EXTENSION_ID,
      url: SWITCHER,
      tab,
    },
  );
  assert.equal(reply.ok, true);
});

test("Save account keeps the session of the page, and Add account signs the page out for the next player", async () => {
  const fake = browser();
  fake.addTab();
  fake.pageToken = fake.autodarts.issue("ada");
  await started(fake);
  await popup(fake, { action: "adopt" });
  assert.equal((await accounts(fake)).activeId, "ada");

  const out = await popup(fake, { action: "signout" });
  assert.equal(out.page, true);
  assert.equal(fake.pageToken, null);
  const state = await accounts(fake);
  assert.equal(state.addingUntil, fake.clock + ADD_WINDOW_MS);
  assert.ok(find(state, "ada")?.token);

  await popup(fake, { action: "stopAdding" });
  assert.equal((await accounts(fake)).addingUntil, null);
});

test("Open Autodarts opens a tab, or shows the one there is", async () => {
  const fake = browser();
  // The browser may not know a window that was used last.
  fake.focusedWindow = undefined;
  await started(fake);
  await popup(fake, { action: "openPage" });
  assert.deepEqual(fake.opened, [PLAY_URL]);
  const [tab] = fake.tabs_;
  await popup(fake, { action: "openPage" });
  assert.deepEqual(fake.focused, [tab?.id]);
});

test("a password is remembered and forgotten, and a removed account takes its PIN along", async () => {
  const fake = browser();
  await twoPlayers(fake);
  fake.local.data.set(VENUE_KEY, { players: { bob: await quickHash("1234") } });
  await started(fake);

  await popup(fake, {
    action: "remember",
    id: "bob",
    username: "bob",
    password: "secret",
  });
  assert.deepEqual(find(await accounts(fake), "bob")?.credentials, {
    username: "bob",
    password: "secret",
  });
  await popup(fake, { action: "forgetPassword", id: "bob" });
  assert.equal(find(await accounts(fake), "bob")?.credentials, null);
  const removed = await popup(fake, { action: "removeAccount", id: "bob" });
  assert.deepEqual(
    removed.view.profiles.map((profile) => profile.id),
    ["ada"],
  );
  assert.deepEqual(
    (fake.local.data.get(VENUE_KEY) as { players: object }).players,
    {},
  );
});

test("an account with a PIN switches only with its PIN, and too many wrong ones lock the PINs for a while", async () => {
  const fake = browser();
  await twoPlayers(fake);
  fake.local.data.set(VENUE_KEY, { players: { bob: await quickHash("1234") } });
  fake.addTab();
  await started(fake);
  const before = fake.autodarts.refreshes.length;

  const ask = await popup(fake, { action: "switch", id: "bob" });
  assert.deepEqual([ask.reason, ask.pin, ask.wrong], ["pin", "player", false]);
  assert.equal(
    ask.view.profiles.find((profile) => profile.id === "bob")?.pin,
    true,
  );
  for (let attempt = 1; attempt < MAX_FAILURES; attempt += 1) {
    const wrong = await popup(fake, {
      action: "switch",
      id: "bob",
      pin: "0000",
    });
    assert.equal(wrong.wrong, true);
  }
  const locked = await popup(fake, {
    action: "switch",
    id: "bob",
    pin: "0000",
  });
  assert.equal(locked.reason, "locked");
  assert.equal(locked.retryIn, 60_000);
  assert.ok(fake.sessionArea.data.has(LOCKOUT_KEY));
  assert.equal(fake.autodarts.refreshes.length, before);

  fake.clock += 60_000;
  const right = await popup(fake, { action: "switch", id: "bob", pin: "1234" });
  assert.equal(right.ok, true);
});

test("while a manager PIN is set, Manage accounts and its changes need it", async () => {
  const fake = browser();
  await twoPlayers(fake);
  fake.local.data.set(VENUE_KEY, { manager: await quickHash("9999") });
  await started(fake);

  for (const message of [
    { action: "unlock" },
    { action: "remember", id: "bob", username: "bob", password: "x" },
    { action: "forgetPassword", id: "bob" },
    { action: "removeAccount", id: "bob" },
  ]) {
    const refused = await popup(fake, message);
    assert.deepEqual(
      [refused.reason, refused.pin],
      ["pin", "manager"],
      JSON.stringify(message),
    );
    assert.deepEqual(refused.view.venue, { manager: true });
  }
  assert.equal((await accounts(fake)).profiles.length, 2);
  const open = await popup(fake, { action: "unlock", managerPin: "9999" });
  assert.equal(open.ok, true);
});

test("the popup says when the accounts are of a newer version, and leaves them as they are", async () => {
  const fake = browser();
  fake.local.data.set(ACCOUNTS_KEY, { version: 99, profiles: [] });
  await started(fake);
  const reply = await popup(fake, { action: "view" });
  assert.deepEqual([reply.error, reply.view.profiles], ["unknownFormat", []]);
  assert.deepEqual(fake.local.data.get(ACCOUNTS_KEY), {
    version: 99,
    profiles: [],
  });
});

test("a request that fails leaves a trace and still shows the accounts", async () => {
  const fake = browser();
  await twoPlayers(fake);
  await started(fake);
  fake.local.failing.set = true;
  const reply = await popup(fake, { action: "stopAdding" });
  assert.equal(reply.error, "error");
  assert.equal(reply.view.profiles.length, 2);
  assert.ok(
    fake.logs.includes('Player Switch: the request "stopAdding" failed.'),
  );
});

test("a request that needs a page and finds none says so", async () => {
  const fake = browser();
  await started(fake);
  const reply = await popup(fake, { action: "adopt" });
  assert.deepEqual([reply.error, reply.page], ["noPage", false]);
});

test("a request with a tab that opens without an id says there is no page", async () => {
  const fake = browser();
  await twoPlayers(fake);
  await started(fake);
  fake.broken.add("tabs.create");
  const reply = await popup(fake, { action: "switch", id: "bob" });
  assert.equal(reply.error, "noPage");
});

test("the options page sees the venue mode without a hash, and changes it with the manager PIN", async () => {
  const fake = browser();
  await twoPlayers(fake);
  await started(fake);

  const status = await venue(fake, { action: "status" });
  assert.deepEqual("status" in status && status.status, {
    manager: false,
    idleMinutes: null,
    house: null,
    accounts: [
      { id: "ada", name: "ada", username: "ada", pin: false },
      { id: "bob", name: "bob", username: "bob", pin: false },
    ],
  });
  assert.deepEqual(await venue(fake, { action: "managerPin", pin: "12" }), {
    ok: false,
    reason: "invalid",
    status: status.status,
  });
  const set = await venue(fake, { action: "managerPin", pin: "123456" });
  assert.equal(set.ok, true);
  assert.equal((set as { status: { manager: boolean } }).status.manager, true);
  assert.ok(!JSON.stringify(set).includes("hash"));

  const refused = await venue(fake, {
    action: "idle",
    minutes: 5,
    house: "ada",
  });
  assert.deepEqual([refused.reason, refused.pin], ["pin", "manager"]);
  const idle = await venue(fake, {
    action: "idle",
    minutes: 5,
    house: "ada",
    managerPin: "123456",
  });
  assert.deepEqual(idle.status, {
    manager: true,
    idleMinutes: 5,
    house: "ada",
    accounts: (set as { status: { accounts: object } }).status.accounts,
  });
  assert.equal(fake.sessionArea.data.get(ACTIVITY_KEY), fake.clock);
  assert.equal(
    (
      (await venue(fake, { action: "unlock", managerPin: "123456" })) as {
        ok: boolean;
      }
    ).ok,
    true,
  );
  const removed = await venue(fake, {
    action: "managerPin",
    pin: null,
    managerPin: "123456",
  });
  assert.equal(
    (removed as { status: { manager: boolean } }).status.manager,
    false,
  );
});

test("a PIN goes only to a saved account, and goes again with null", async () => {
  const fake = browser();
  await twoPlayers(fake);
  await started(fake);
  assert.equal(
    (
      (await venue(fake, { action: "playerPin", id: "carl", pin: "1234" })) as {
        reason?: string;
      }
    ).reason,
    "invalid",
  );
  assert.equal(
    (
      (await venue(fake, { action: "playerPin", id: "bob", pin: "12" })) as {
        reason?: string;
      }
    ).reason,
    "invalid",
  );
  const set = await venue(fake, {
    action: "playerPin",
    id: "bob",
    pin: "1234",
  });
  assert.deepEqual(
    set.status?.accounts.map((account) => account.pin),
    [false, true],
  );
  const gone = await venue(fake, { action: "playerPin", id: "bob", pin: null });
  assert.deepEqual(
    gone.status?.accounts.map((account) => account.pin),
    [false, false],
  );
});

test("a venue request that fails leaves a trace, with the status where it can still be read", async () => {
  const fake = browser();
  await started(fake);
  fake.local.failing.set = true;
  const failed = await venue(fake, { action: "managerPin", pin: null });
  assert.deepEqual([failed.error, failed.status !== null], ["error", true]);
  fake.local.failing.get = true;
  const blind = await venue(fake, { action: "status" });
  assert.deepEqual(blind, { error: "error", status: null });
  assert.ok(
    fake.logs.includes('Player Switch: the venue request "managerPin" failed.'),
  );
});

test("an input on an Autodarts page counts for the return after a break; one from elsewhere doesn't", async () => {
  const fake = browser();
  await started(fake);
  const tab = fake.addTab();
  assert.equal(
    (
      await fake.send(
        { type: "activity" },
        { id: EXTENSION_ID, url: PLAY, tab },
      )
    ).handled,
    false,
  );
  assert.equal(fake.sessionArea.data.get(ACTIVITY_KEY), fake.clock);

  fake.sessionArea.data.clear();
  await fake.send(
    { type: "activity" },
    { id: EXTENSION_ID, url: "https://example.com/" },
  );
  assert.equal(fake.sessionArea.data.has(ACTIVITY_KEY), false);

  fake.sessionArea.failing.set = true;
  await fake.send({ type: "activity" }, { id: EXTENSION_ID, url: PLAY, tab });
  await fake.send({ type: "popup", action: "stopAdding" });
  await until(() => fake.logs.length >= 2, "the traces");
  assert.deepEqual(fake.logs, [
    "Player Switch: noting an input failed.",
    "Player Switch: noting an input failed.",
  ]);
});

test("the switcher asks to close, and only its own tab hears it", async () => {
  const fake = browser();
  await started(fake);
  const tab = fake.addTab();
  assert.equal(
    (
      await fake.send(
        { type: "switcher", action: "close" },
        { id: EXTENSION_ID, url: SWITCHER, tab },
      )
    ).handled,
    false,
  );
  assert.deepEqual(fake.told, [
    { tabId: tab.id, message: { type: "page", action: "closeSwitcher" } },
  ]);
  // From the popup, without a tab, there is nothing to close; a tab that doesn't answer has no say.
  await fake.send({ type: "switcher", action: "close" });
  tab.answers = false;
  await fake.send(
    { type: "switcher", action: "close" },
    { id: EXTENSION_ID, url: SWITCHER, tab },
  );
  assert.equal(fake.told.length, 2);
});

test("a change of the settings, the accounts or the venue mode redraws the button in every Autodarts tab", async () => {
  const fake = browser();
  await started(fake);
  const one = fake.addTab();
  fake.addTab({ url: "https://example.com/" });
  // A tab that the browser gives no id has no content script to tell.
  fake.tabs_.push({
    windowId: 1,
    active: false,
    url: PLAY,
    answers: true,
  } as never);
  await fake.local.set({
    [SETTINGS_KEY]: { showButton: false, corner: "top-left" },
  });
  await until(() => fake.told.length === 1, "the redraw");
  assert.deepEqual(fake.told[0], {
    tabId: one.id,
    message: {
      type: "page",
      action: "button",
      view: {
        settings: { showButton: false, corner: "top-left" },
        player: null,
        reportActivity: false,
      },
    },
  });
  // Another value, or the session storage, redraws nothing.
  await fake.local.set({ [HEALTH_KEY]: {} });
  await fake.sessionArea.set({ [ACTIVITY_KEY]: 1 });
  await settle();
  assert.equal(fake.told.length, 1);

  fake.local.failing.get = true;
  await fake.local.remove([SETTINGS_KEY]);
  await until(() => fake.logs.length === 1, "the trace");
  assert.deepEqual(fake.logs, [
    "Player Switch: redrawing the button in the page failed.",
  ]);
});

test("the return after a break keeps its alarm while it is on, and clears it as it goes off", async () => {
  const fake = browser();
  await twoPlayers(fake);
  fake.local.data.set(VENUE_KEY, { idleMinutes: 5 });
  await started(fake);
  // The start sets the alarm that a restart of the browser may have cleared.
  assert.deepEqual(fake.alarmsSet.get(IDLE_ALARM), { periodInMinutes: 1 });

  fake.alarmsSet.set(IDLE_ALARM, { periodInMinutes: 7 });
  await fake.local.set({ [VENUE_KEY]: { idleMinutes: 10 } });
  await settle();
  assert.deepEqual(fake.alarmsSet.get(IDLE_ALARM), { periodInMinutes: 7 });
  await fake.local.set({ [VENUE_KEY]: { idleMinutes: null } });
  await until(() => !fake.alarmsSet.has(IDLE_ALARM), "the clear");

  fake.broken.add("alarms.get");
  await fake.local.set({ [VENUE_KEY]: { idleMinutes: 5 } });
  await until(() => fake.logs.length === 1, "the trace");
  assert.deepEqual(fake.logs, [
    "Player Switch: the alarm of the venue mode failed.",
  ]);
});

test("a start that can't read the venue mode leaves a trace", async () => {
  const fake = browser();
  fake.local.data.set(VENUE_KEY, { idleMinutes: 5 });
  fake.broken.add(`alarms.get:${IDLE_ALARM}`);
  await started(fake);
  assert.ok(
    fake.logs.includes("Player Switch: the alarm of the venue mode failed."),
  );
});

test("after a break the display returns to the house account, never during a match", async () => {
  const fake = browser();
  await twoPlayers(fake);
  fake.local.data.set(VENUE_KEY, { idleMinutes: 5, house: "bob" });
  const tab = fake.addTab({ url: MATCH });
  await started(fake);

  // A match counts as input: the break starts once it is over.
  fake.alarms.onAlarm.fire({ name: IDLE_ALARM });
  await until(
    () => fake.sessionArea.data.get(ACTIVITY_KEY) === fake.clock,
    "the input",
  );
  tab.url = PLAY;
  fake.clock += 4 * MINUTE;
  fake.alarms.onAlarm.fire({ name: IDLE_ALARM });
  await settle();
  assert.equal((await accounts(fake)).activeId, "ada");

  fake.clock += 2 * MINUTE;
  fake.alarms.onAlarm.fire({ name: IDLE_ALARM });
  fake.alarms.onAlarm.fire({ name: IDLE_ALARM });
  await until(() => fake.pageToken?.startsWith("bob") === true, "the return");
  await settle();
  assert.equal((await accounts(fake)).activeId, "bob");
  assert.equal(fake.autodarts.reuses, 0);
});

test("after a break without a house account the display signs out, and with nobody on it nothing happens", async () => {
  const fake = browser();
  await twoPlayers(fake);
  fake.local.data.set(VENUE_KEY, { idleMinutes: 5 });
  fake.sessionArea.data.set(ACTIVITY_KEY, fake.clock - 10 * MINUTE);
  fake.addTab();
  await started(fake);
  fake.alarms.onAlarm.fire({ name: IDLE_ALARM });
  await until(() => fake.pageToken === null, "the sign-out");
  await settle();
  const state = await accounts(fake);
  assert.equal(state.activeId, null);
  assert.equal(state.addingUntil, null);
  assert.ok(find(state, "ada")?.token);

  const told = fake.told.length;
  fake.alarms.onAlarm.fire({ name: IDLE_ALARM });
  await settle();
  assert.ok(
    !fake.told.slice(told).some(({ message }) => message.action === "clear"),
  );
});

test("the return after a break does nothing while it is off or with no Autodarts tab, and a failure leaves a trace", async () => {
  const fake = browser();
  await twoPlayers(fake);
  await started(fake);
  fake.alarms.onAlarm.fire({ name: IDLE_ALARM });
  await settle();
  assert.equal(fake.sessionArea.data.has(ACTIVITY_KEY), false);

  fake.local.data.set(VENUE_KEY, { idleMinutes: 5 });
  fake.sessionArea.data.set(ACTIVITY_KEY, fake.clock - 10 * MINUTE);
  fake.alarms.onAlarm.fire({ name: IDLE_ALARM });
  await settle();
  assert.equal((await accounts(fake)).activeId, "ada");
  assert.deepEqual(fake.logs, []);

  fake.sessionArea.failing.get = true;
  fake.alarms.onAlarm.fire({ name: IDLE_ALARM });
  await until(() => fake.logs.length === 1, "the trace");
  assert.deepEqual(fake.logs, [
    "Player Switch: the return after a break failed.",
  ]);
});

test("the keyboard shortcut toggles the switcher in the Autodarts tab in front, also in a tab from before an update", async () => {
  const fake = browser();
  await started(fake);
  const tab = fake.addTab({ answers: false });
  fake.commands.onCommand.fire("toggle-switcher", tab);
  await until(() => fake.told.length === 2, "the toggle");
  assert.deepEqual(fake.injected, [tab.id]);
  assert.deepEqual(
    fake.told.map(({ message }) => message.action),
    ["toggleSwitcher", "toggleSwitcher"],
  );

  fake.commands.onCommand.fire("_execute_action", tab);
  fake.commands.onCommand.fire("toggle-switcher", {
    windowId: 1,
    active: true,
    url: PLAY,
  });
  fake.commands.onCommand.fire("toggle-switcher", {
    ...tab,
    url: "https://example.com/",
  });
  fake.commands.onCommand.fire("toggle-switcher");
  const blocked = fake.addTab({ answers: false, blocked: true });
  fake.commands.onCommand.fire("toggle-switcher", blocked);
  await settle();
  assert.equal(fake.told.length, 3);
  assert.deepEqual(fake.logs, []);
});

test("the badge says who has to sign in again, and a plus for a session that no account keeps", async () => {
  const fake = browser();
  await twoPlayers(fake, (state) => ({
    ...state,
    profiles: state.profiles.map((profile) =>
      profile.id === "bob"
        ? { ...profile, token: null, needsSignIn: true }
        : profile,
    ),
  }));
  fake.addTab();
  await started(fake);
  assert.deepEqual(fake.badge, {
    text: "1",
    color: BADGE_COLORS.signIn,
    title: "badgeTitle: bob",
    textColor: BADGE_TEXT_COLOR,
  });

  // The accounts change: the session of the page is nobody's now.
  const state = await accounts(fake);
  await fake.seed({ ...state, activeId: null });
  await until(() => fake.badge.text === "+", "the plus");
  assert.equal(fake.badge.color, BADGE_COLORS.unsaved);
  assert.equal(fake.badge.title, "badgeUnsaved\nbadgeTitle: bob");

  // Closing the tab that held the session takes the plus away.
  fake.tabs_.splice(0);
  fake.tabs.onRemoved.fire();
  await until(() => fake.badge.text === "1", "the count");
  fake.tabs.onRemoved.fire();
  await settle();
  assert.equal(fake.badge.text, "1");

  fake.broken.add("badge");
  fake.badge.text = "+";
  await fake.seed(state);
  fake.tabs.onRemoved.fire();
  await until(() => fake.logs.length >= 1, "the trace");
  assert.ok(
    fake.logs.every((line) => line === "Player Switch: the badge failed."),
  );
});

test("a new sign-in on a page that loaded is saved by itself, with a check mark on the icon for a moment", async () => {
  const fake = browser();
  await fake.seed(startAdding(EMPTY, fake.clock + ADD_WINDOW_MS));
  const tab = fake.addTab();
  await started(fake);
  fake.pageToken = fake.autodarts.issue("ada");
  fake.tabs.onUpdated.fire(tab.id, { status: "complete" }, tab);
  await until(() => fake.badge.text === "✓", "the check mark");
  assert.deepEqual(
    [fake.badge.color, fake.badge.title],
    [SAVED_COLOR, "badgeSaved: ada"],
  );
  assert.equal((await accounts(fake)).activeId, "ada");

  // The badge waits for the check mark, also when the accounts change meanwhile.
  await fake.seed(await accounts(fake));
  await settle();
  assert.equal(fake.badge.text, "✓");
  const [later] = fake.later;
  assert.equal(later?.ms, SAVED_BADGE_MS);
  later?.task();
  await until(() => fake.badge.text === "", "the badge after the check mark");

  // A failure of the badge after the check mark leaves a trace.
  fake.broken.add("badge");
  later?.task();
  await until(() => fake.logs.length === 1, "the trace");
});

test("a page that loaded without a new sign-in keeps the badge current a few times, and other tabs are left alone", async () => {
  const fake = browser();
  const tab = fake.addTab();
  await started(fake);
  fake.tabs.onUpdated.fire(tab.id, { status: "loading" }, tab);
  fake.tabs.onUpdated.fire(
    tab.id,
    { status: "complete" },
    { ...tab, url: "https://example.com/" },
  );
  await settle();
  assert.deepEqual(fake.waits, []);

  fake.tabs.onUpdated.fire(tab.id, { status: "complete" }, tab);
  await until(
    () => fake.waits.length === PICK_UP_DELAYS_MS.length,
    "the looks",
  );
  assert.deepEqual(fake.waits, [...PICK_UP_DELAYS_MS]);

  fake.local.failing.get = true;
  fake.tabs.onUpdated.fire(tab.id, { status: "complete" }, tab);
  await until(() => fake.logs.length === 1, "the trace");
  assert.deepEqual(fake.logs, ["Player Switch: saving a new sign-in failed."]);
});

test("a check mark that shows while the badge is read stays", async () => {
  const fake = browser();
  await fake.seed(startAdding(EMPTY, fake.clock + ADD_WINDOW_MS));
  const tab = fake.addTab();
  await started(fake);
  fake.pageToken = fake.autodarts.issue("ada");
  // The badge reads the accounts while the new sign-in is being saved.
  fake.tabs.onRemoved.fire();
  fake.tabs.onUpdated.fire(tab.id, { status: "complete" }, tab);
  await until(() => fake.badge.text === "✓", "the check mark");
  await settle();
  assert.equal(fake.badge.text, "✓");
});
