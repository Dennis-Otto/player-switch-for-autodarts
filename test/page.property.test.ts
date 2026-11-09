/**
 * Properties of the switcher in the page, checked by fast-check on stored settings of
 * any shape, on any address and on any key: the settings always come out valid and
 * keep what is valid, only a match page asks before a switch, every lobby comes out of
 * its address, and a key picks a tile that exists or none.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import fc from "fast-check";

import {
  CORNERS,
  initialOf,
  isMatchPage,
  isPlayPage,
  lobbyOf,
  mustConfirm,
  PLAY_ORIGINS,
  parseSettings,
  tileForKey,
} from "../src/page.ts";
import "./properties.ts";

const corner = fc.constantFrom(...CORNERS);

test("parseSettings always answers settings the button can use", () => {
  fc.assert(
    fc.property(fc.anything(), (stored) => {
      const settings = parseSettings(stored);
      assert.equal(typeof settings.showButton, "boolean");
      assert.ok(CORNERS.includes(settings.corner));
      assert.deepEqual(Object.keys(settings).sort(), ["corner", "showButton"]);
    }),
  );
});

test("parseSettings reads back what the options page stores", () => {
  fc.assert(
    fc.property(
      fc.boolean(),
      corner,
      fc.dictionary(fc.string(), fc.anything()),
      (showButton, chosen, extra) => {
        assert.deepEqual(
          parseSettings({ ...extra, showButton, corner: chosen }),
          { showButton, corner: chosen },
        );
      },
    ),
  );
});

test("initialOf answers a letter of the name or the username, never nothing", () => {
  fc.assert(
    fc.property(
      fc.string({ unit: "binary" }),
      fc.string({ unit: "binary" }),
      (name, username) => {
        const initial = initialOf({ name, username });
        const source = name.trim() || username.trim();
        if (source === "") {
          assert.equal(initial, "?");
        } else {
          assert.ok(initial.length > 0 && initial.trim() === initial);
          assert.equal(initial, initial.toUpperCase());
          assert.equal(
            initial.toLowerCase(),
            [...source][0]?.toUpperCase().toLowerCase(),
          );
        }
      },
    ),
  );
});

test("a page outside Autodarts Play is neither a play page, a match nor a lobby", () => {
  fc.assert(
    fc.property(
      fc.webUrl({ withQueryParameters: true, withFragments: true }),
      (url) => {
        fc.pre(!PLAY_ORIGINS.includes(new URL(url).origin));
        assert.ok(!isPlayPage(url));
        assert.ok(!isMatchPage(url));
        assert.equal(lobbyOf(url), null);
        assert.ok(!mustConfirm(url, undefined));
      },
    ),
  );
});

test("every match of Autodarts Play is a play page that asks before a switch", () => {
  const segment = fc.stringMatching(/^[A-Za-z0-9-]{1,40}$/);
  fc.assert(
    fc.property(
      fc.constantFrom(...PLAY_ORIGINS),
      segment,
      fc.anything(),
      (origin, id, confirmed) => {
        const url = `${origin}/matches/${id}`;
        assert.ok(isPlayPage(url));
        assert.ok(isMatchPage(url));
        assert.equal(mustConfirm(url, confirmed), confirmed !== true);
      },
    ),
  );
});

test("every lobby of Autodarts Play comes out of its address, and asks before no switch", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...PLAY_ORIGINS),
      fc.constantFrom("lobby", "lobbies"),
      fc.uuid({ version: [1, 4, 7] }),
      fc.constantFrom("", "/", "?board=1", "#seats", "/?board=1#seats"),
      (origin, path, id, rest) => {
        const url = `${origin}/${path}/${id}${rest}`;
        assert.equal(lobbyOf(url), id);
        assert.ok(isPlayPage(url));
        assert.ok(!mustConfirm(url, undefined));
      },
    ),
  );
});

test("a key picks a tile that exists, or none", () => {
  fc.assert(
    fc.property(fc.string(), fc.nat(20), (key, count) => {
      const index = tileForKey(key, count);
      if (index !== null) {
        assert.ok(
          Number.isInteger(index) && index >= 0 && index < count && index < 9,
        );
        assert.equal(key, String(index + 1));
      }
    }),
  );
});
