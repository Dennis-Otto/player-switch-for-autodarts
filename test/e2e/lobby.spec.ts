// Joining a lobby: a parked player takes a seat in the lobby that the display shows,
// with the session that the extension keeps for them, while the page plays on with
// the host. Against the fake Autodarts of fixtures.ts, which fails every test that
// sends a refresh token a second time. The buttons come later; until then the test
// sends the request of the popup itself, from the popup.
import type { Page } from "@playwright/test";

import { ALICE, BOB, CAROL, expect, expectPlayer, test } from "./fixtures.ts";

/** Asks the service worker, from a page of the extension, to seat an account in the lobby. */
function join(popup: Page, id: string): Promise<Record<string, unknown>> {
  return popup.evaluate(
    (account) =>
      chrome.runtime.sendMessage({
        type: "popup",
        action: "join",
        id: account,
      }),
    id,
  );
}

test("a parked player joins the lobby on the display, and the host plays on", async ({
  autodarts,
  display,
}) => {
  const page = await display.openAutodarts();
  const popup = await display.saveAccounts(page, [ALICE, BOB, CAROL]);
  // Carol plays, and opens a lobby on the board of the display.
  const lobby = autodarts.openLobby(CAROL);
  await page.goto(`${new URL(page.url()).origin}/lobbies/${lobby}`);
  await expectPlayer(page, CAROL);

  const renewals = autodarts.count("refresh", ALICE);
  const reply = await join(popup.page, ALICE.id);

  expect(reply).toMatchObject({ ok: true, joined: ALICE.name });
  expect(autodarts.seatsOf(lobby)).toEqual([CAROL.id, ALICE.id]);
  // One renewal of Alice's parked session made the access token of her seat.
  expect(autodarts.count("refresh", ALICE)).toBe(renewals + 1);
  expect(autodarts.count("seat", ALICE)).toBe(1);
  // The page kept its player, and Alice keeps her parked session.
  await expectPlayer(page, CAROL);
  await popup.reopen();
  await popup.expectAccounts([ALICE, BOB, CAROL], CAROL);
  expect(autodarts.sessionsOf(ALICE)).toBe(1);

  // A second join of the same player keeps the seat she has.
  const again = await join(popup.page, ALICE.id);
  expect(again).toMatchObject({ ok: true, joined: ALICE.name });
  expect(autodarts.seatsOf(lobby)).toEqual([CAROL.id, ALICE.id]);
  expect(autodarts.count("seat", ALICE)).toBe(1);
});

test("a join finds no lobby on any other page of Autodarts, and spends no token", async ({
  autodarts,
  display,
}) => {
  const page = await display.openAutodarts();
  const popup = await display.saveAccounts(page, [ALICE, BOB]);
  const renewals = autodarts.count("refresh", ALICE);

  const reply = await join(popup.page, ALICE.id);

  expect(reply).toMatchObject({ ok: false, reason: "noLobby" });
  expect(autodarts.count("refresh", ALICE)).toBe(renewals);
  await expectPlayer(page, BOB);
});
