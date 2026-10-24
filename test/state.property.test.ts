/**
 * Properties of the stored accounts, checked by fast-check on many generated
 * histories of changes and on stored data of any shape: whatever happened before,
 * the accounts stay in order, a stored password changes only when a person asks,
 * the popup never sees a session or a password, and what the extension stores it
 * reads back the same.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import fc from "fast-check";

import type { Identity } from "../src/autodarts.ts";
import {
  activate,
  type Credentials,
  deactivate,
  EMPTY,
  endSession,
  find,
  forget,
  forgetCredentials,
  park,
  parked,
  parseState,
  rememberCredentials,
  setActive,
  type State,
  stash,
  toView,
} from "../src/state.ts";
import "./properties.ts";

/** Any text, beyond ASCII: names come from people, tokens from the network. */
const text = fc.string({ unit: "binary" });
const filled = fc.string({ unit: "binary", minLength: 1 });

/** A few accounts, so that the changes meet the same ones again and again. */
const id = fc.constantFrom("a", "b", "c", "d");
const identity: fc.Arbitrary<Identity> = fc.record({
  id,
  // Names that sort alike and apart, also the same name for two accounts.
  username: fc.oneof(fc.constantFrom("ada", "Ada", "bob", "zoë"), text),
  name: text,
  picture: fc.option(text, { nil: null }),
});
// A plain object, as the popup sends it in a message.
const credentials: fc.Arbitrary<Credentials> = fc.record(
  { username: filled, password: filled },
  { noNullPrototype: true },
);
const now = fc.nat();

/** One change of the stored accounts, as the extension makes them. */
const change = fc.oneof(
  fc.record({ kind: fc.constant("park" as const), identity, token: filled, now }),
  fc.record({ kind: fc.constant("stash" as const), id, token: filled, now }),
  fc.record({ kind: fc.constant("setActive" as const), identity }),
  fc.record({ kind: fc.constant("activate" as const), id }),
  fc.record({ kind: fc.constant("endSession" as const), id }),
  fc.record({ kind: fc.constant("deactivate" as const) }),
  fc.record({ kind: fc.constant("forget" as const), id }),
  fc.record({ kind: fc.constant("rememberCredentials" as const), id, credentials }),
  fc.record({ kind: fc.constant("forgetCredentials" as const), id }),
);
type Change = typeof change extends fc.Arbitrary<infer T> ? T : never;

function apply(state: State, step: Change): State {
  switch (step.kind) {
    case "park":
      return park(state, step.identity, step.token, step.now);
    case "stash":
      return stash(state, step.id, step.token, step.now);
    case "setActive":
      return setActive(state, step.identity);
    case "activate":
      return activate(state, step.id);
    case "endSession":
      return endSession(state, step.id);
    case "deactivate":
      return deactivate(state);
    case "forget":
      return forget(state, step.id);
    case "rememberCredentials":
      return rememberCredentials(state, step.id, step.credentials);
    case "forgetCredentials":
      return forgetCredentials(state, step.id);
  }
}

/** Every state the changes make: one after each change, from the empty one. */
function history(steps: Change[]): State[] {
  const states = [EMPTY];
  for (const step of steps) {
    states.push(apply(states.at(-1) as State, step));
  }
  return states;
}

const changes = fc.array(change, { maxLength: 40, size: "max" });

test("every change keeps each account once, in the order of the popup, and the active one among them", () => {
  fc.assert(
    fc.property(changes, (steps) => {
      for (const state of history(steps)) {
        const ids = state.profiles.map((profile) => profile.id);
        assert.equal(new Set(ids).size, ids.length);
        for (const [index, profile] of state.profiles.entries()) {
          const next = state.profiles[index + 1];
          if (next !== undefined) {
            const order = profile.username.localeCompare(next.username) || profile.id.localeCompare(next.id);
            assert.ok(order < 0, `${profile.id} before ${next.id}`);
          }
        }
        assert.ok(state.activeId === null || ids.includes(state.activeId));
        // The active account never needs a new sign-in, and the background never renews it.
        assert.equal(state.activeId === null ? false : find(state, state.activeId)?.needsSignIn, false);
        assert.ok(parked(state).every((profile) => profile.token !== null && profile.id !== state.activeId));
      }
    }),
  );
});

test("a stored password changes only when a person keeps or drops it", () => {
  fc.assert(
    fc.property(changes, (steps) => {
      let state = EMPTY;
      const kept = new Map<string, Credentials | null>();
      for (const step of steps) {
        const known = "id" in step && find(state, step.id) !== undefined;
        state = apply(state, step);
        if (step.kind === "rememberCredentials" && known) {
          kept.set(step.id, step.credentials);
        } else if ((step.kind === "forgetCredentials" && known) || step.kind === "forget") {
          kept.delete(step.id);
        }
        for (const profile of state.profiles) {
          assert.deepEqual(profile.credentials, kept.get(profile.id) ?? null);
        }
      }
    }),
  );
});

test("a session goes where the change puts it, whatever happened before", () => {
  fc.assert(
    fc.property(changes, change, (steps, step) => {
      const before = history(steps).at(-1) as State;
      const after = apply(before, step);
      const target = "identity" in step ? step.identity.id : "id" in step ? step.id : null;
      const profile = target === null ? undefined : find(after, target);
      const existed = target !== null && find(before, target) !== undefined;
      switch (step.kind) {
        case "park":
          // A parked session is renewed in the background, so the account no longer plays.
          assert.equal(profile?.token, step.token);
          assert.equal(profile?.refreshedAt, step.now);
          assert.notEqual(after.activeId, target);
          break;
        case "stash":
          assert.equal(profile?.token, existed ? step.token : undefined);
          break;
        case "setActive":
        case "activate":
          // The session of the account that plays belongs to the page.
          assert.equal(after.activeId, existed || step.kind === "setActive" ? target : before.activeId);
          assert.equal(profile?.token, existed || step.kind === "setActive" ? null : undefined);
          break;
        case "endSession":
          assert.equal(profile?.token, existed ? null : undefined);
          assert.equal(profile?.needsSignIn, existed ? true : undefined);
          assert.notEqual(after.activeId, target);
          break;
        case "deactivate":
          assert.equal(after.activeId, null);
          break;
        case "forget":
          assert.equal(profile, undefined);
          assert.notEqual(after.activeId, target);
          break;
        default:
          // A password change leaves the sessions alone.
          assert.deepEqual(
            after.profiles.map(({ credentials: _, ...rest }) => rest),
            before.profiles.map(({ credentials: _, ...rest }) => rest),
          );
          assert.equal(after.activeId, before.activeId);
      }
    }),
  );
});

test("what the extension stores, it reads back the same", () => {
  fc.assert(
    fc.property(changes, (steps) => {
      for (const state of history(steps)) {
        assert.deepEqual(parseState(JSON.parse(JSON.stringify(state))), state);
      }
    }),
  );
});

/** Stored data that is nearly a state: right and wrong types in every field. */
const almostState = fc.record(
  {
    activeId: fc.oneof(id, fc.anything()),
    profiles: fc.array(
      fc.oneof(
        fc.record(
          {
            id: fc.oneof(id, fc.constant(""), fc.anything()),
            username: fc.oneof(text, fc.anything()),
            name: fc.oneof(text, fc.anything()),
            picture: fc.oneof(text, fc.anything()),
            token: fc.oneof(text, fc.anything()),
            needsSignIn: fc.oneof(fc.boolean(), fc.anything()),
            refreshedAt: fc.oneof(now, fc.anything()),
            credentials: fc.oneof(
              fc.record({ username: fc.oneof(text, fc.anything()), password: fc.oneof(text, fc.anything()) }),
              fc.anything(),
            ),
          },
          { requiredKeys: [] },
        ),
        fc.anything(),
      ),
    ),
  },
  { requiredKeys: [] },
);

test("parseState reads stored data of any shape, keeping only what is an account", () => {
  fc.assert(
    fc.property(fc.oneof(almostState, fc.anything(), fc.jsonValue()), (stored) => {
      const state = parseState(stored);
      for (const profile of state.profiles) {
        assert.ok(typeof profile.id === "string" && profile.id !== "");
        assert.equal(typeof profile.username, "string");
        assert.equal(typeof profile.name, "string");
        assert.ok(profile.picture === null || typeof profile.picture === "string");
        assert.ok(profile.token === null || (typeof profile.token === "string" && profile.token !== ""));
        assert.equal(typeof profile.needsSignIn, "boolean");
        assert.ok(profile.refreshedAt === null || typeof profile.refreshedAt === "number");
        const kept = profile.credentials;
        assert.ok(kept === null || (kept.username !== "" && kept.password !== ""));
      }
      assert.ok(state.activeId === null || find(state, state.activeId) !== undefined);
      // Reading what was read changes nothing.
      assert.deepEqual(parseState(state), state);
    }),
  );
});

test("the popup sees no session and no password of any account", () => {
  const stored = fc.oneof(almostState, changes.map((steps) => history(steps).at(-1)));
  fc.assert(
    fc.property(stored, fc.boolean(), (value, pageHasSession) => {
      const state = parseState(value);
      const view = toView(state, pageHasSession);
      assert.equal(view.unsaved, pageHasSession && state.activeId === null);
      assert.equal(view.profiles.length, state.profiles.length);
      for (const [index, shown] of view.profiles.entries()) {
        const profile = state.profiles[index];
        assert.deepEqual(Object.keys(shown).sort(), [
          "active",
          "id",
          "name",
          "needsSignIn",
          "picture",
          "remembersPassword",
          "renewedAt",
          "username",
        ]);
        assert.equal(shown.id, profile?.id);
        assert.equal(shown.active, shown.id === state.activeId);
        assert.equal(shown.remembersPassword, profile?.credentials !== null);
        // A time shows only for a parked session, which the extension renews itself.
        const ownsSession = profile?.token !== null && !shown.active;
        assert.equal(shown.renewedAt, ownsSession ? profile?.refreshedAt : null);
      }
    }),
  );
});
