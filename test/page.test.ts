import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CORNERS,
  DEFAULT_SETTINGS,
  initialOf,
  isMatchPage,
  isPlayPage,
  mustConfirm,
  PLAY_ORIGINS,
  parseSettings,
  tileForKey,
  toButtonView,
} from "../src/page.ts";
import { EMPTY, type Profile, type State } from "../src/state.ts";

const ada: Profile = {
  id: "a",
  username: "ada",
  name: "Ada",
  picture: "https://p/a.png",
  token: null,
  needsSignIn: false,
  refreshedAt: null,
  credentials: { username: "ada", password: "secret" },
};
const bob: Profile = { ...ada, id: "b", username: "bob", name: "Bob", picture: null, token: "t-bob", credentials: null };

test("the button shows by default, at the bottom right", () => {
  assert.deepEqual(DEFAULT_SETTINGS, { showButton: true, corner: "bottom-right" });
  assert.equal(CORNERS[0], DEFAULT_SETTINGS.corner);
});

test("parseSettings takes the default from anything that isn't settings", () => {
  for (const stored of [undefined, null, 42, "bottom-left", true]) {
    assert.deepEqual(parseSettings(stored), DEFAULT_SETTINGS);
  }
});

test("parseSettings keeps each setting it knows", () => {
  assert.deepEqual(parseSettings({ showButton: false, corner: "top-left" }), { showButton: false, corner: "top-left" });
  for (const corner of CORNERS) {
    assert.equal(parseSettings({ corner }).corner, corner);
  }
});

test("parseSettings replaces each setting it doesn't know with its default", () => {
  assert.deepEqual(parseSettings({ showButton: "no", corner: "middle" }), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings({ showButton: false }), { showButton: false, corner: "bottom-right" });
  assert.deepEqual(parseSettings({ corner: "top-right", extra: 1 }), { showButton: true, corner: "top-right" });
});

test("parseSettings answers a copy, so a change of it leaves the default alone", () => {
  const settings = parseSettings(undefined);
  settings.showButton = false;
  assert.equal(DEFAULT_SETTINGS.showButton, true);
});

test("initialOf takes the first letter of the name, in capitals", () => {
  assert.equal(initialOf({ name: "ada", username: "lovelace" }), "A");
  assert.equal(initialOf({ name: "  émile ", username: "e" }), "É");
});

test("initialOf falls back to the username, and to a question mark", () => {
  assert.equal(initialOf({ name: "  ", username: "bob" }), "B");
  assert.equal(initialOf({ name: "", username: " " }), "?");
});

test("initialOf keeps a character outside the basic plane whole", () => {
  assert.equal(initialOf({ name: "🎯 Darts", username: "d" }), "🎯");
});

test("toButtonView shows the account that plays, without its session or password", () => {
  const state: State = { profiles: [ada, bob], activeId: "a" };
  assert.deepEqual(toButtonView(state, { corner: "top-left" }), {
    settings: { showButton: true, corner: "top-left" },
    player: { name: "Ada", picture: "https://p/a.png", initial: "A" },
  });
  const view = JSON.stringify(toButtonView({ profiles: [ada, bob], activeId: "b" }, undefined));
  assert.ok(!view.includes("t-bob") && !view.includes("secret"));
});

test("toButtonView shows no player when none of the saved accounts plays", () => {
  assert.equal(toButtonView(EMPTY, undefined).player, null);
  assert.equal(toButtonView({ profiles: [ada], activeId: "gone" }, undefined).player, null);
});

test("isPlayPage knows both addresses of Autodarts Play and nothing else", () => {
  for (const origin of PLAY_ORIGINS) {
    assert.ok(isPlayPage(`${origin}/`));
    assert.ok(isPlayPage(`${origin}/matches/1`));
  }
  assert.ok(!isPlayPage("https://autodarts.com/"));
  assert.ok(!isPlayPage("https://play.autodarts.com.example.org/"));
  assert.ok(!isPlayPage("http://play.autodarts.com/"));
  assert.ok(!isPlayPage("not a url"));
  assert.ok(!isPlayPage(undefined));
});

test("isMatchPage knows a match that runs", () => {
  assert.ok(isMatchPage("https://play.autodarts.com/matches/0b5a1c2d-0000-4000-8000-000000000001"));
  assert.ok(isMatchPage("https://play.autodarts.io/matches/abc/"));
  assert.ok(isMatchPage("https://play.autodarts.com/matches/abc?board=1#x"));
});

test("isMatchPage leaves every other page alone", () => {
  for (const url of [
    "https://play.autodarts.com/",
    "https://play.autodarts.com/matches",
    "https://play.autodarts.com/matches/",
    "https://play.autodarts.com/lobbies/abc",
    "https://play.autodarts.com/history/matches/abc",
    "https://play.autodarts.com/boards?next=/matches/abc",
    "https://example.org/matches/abc",
    "chrome://extensions/",
    "",
    undefined,
  ]) {
    assert.ok(!isMatchPage(url), url);
  }
});

test("mustConfirm asks only on a match page, until the person confirms", () => {
  const match = "https://play.autodarts.com/matches/abc";
  assert.ok(mustConfirm(match, undefined));
  assert.ok(mustConfirm(match, "true"));
  assert.ok(mustConfirm(match, 1));
  assert.ok(!mustConfirm(match, true));
  assert.ok(!mustConfirm("https://play.autodarts.com/", undefined));
  assert.ok(!mustConfirm(undefined, undefined));
});

test("tileForKey picks the first nine tiles with the keys 1 to 9", () => {
  assert.equal(tileForKey("1", 3), 0);
  assert.equal(tileForKey("3", 3), 2);
  assert.equal(tileForKey("9", 12), 8);
});

test("tileForKey picks no tile for another key or past the last tile", () => {
  assert.equal(tileForKey("4", 3), null);
  assert.equal(tileForKey("1", 0), null);
  for (const key of ["0", "10", "a", "Escape", " ", "", "١"]) {
    assert.equal(tileForKey(key, 9), null, key);
  }
});
