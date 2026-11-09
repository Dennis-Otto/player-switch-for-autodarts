// Joining a lobby: on a lobby of Autodarts, the tile of each parked player offers
// "Join the lobby", in the popup and in the switcher on the page. A tap seats that
// player in the lobby, with the session that the extension keeps for them, while the
// page plays on with the host: no switch, no reload. The tile then says "In the
// lobby", and "Join again" below it seats a player whom the host took out. Against the
// fake Autodarts of fixtures.ts, which fails every test that sends a refresh token a
// second time.
import type { Frame, Page } from "@playwright/test";

import { ALICE, BOB, CAROL, expect, expectPlayer, test } from "./fixtures.ts";

type Account = typeof ALICE;

/** The tile of an account, with its button below, in the popup or the switcher. */
function profileOf(players: Page | Frame, account: Account) {
  return players.locator("#profiles .profile").filter({
    has: players.locator(".name", { hasText: new RegExp(`^${account.name}$`) }),
  });
}

/** The button "Join the lobby" below the tile of an account. */
function joinOf(players: Page | Frame, account: Account) {
  return profileOf(players, account).locator(".join");
}

/** Marks the page, so that a reload, which wipes the mark, shows. */
async function mark(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as { kept?: boolean }).kept = true;
  });
}

/** Whether the page still carries its mark: it didn't reload. */
function kept(page: Page): Promise<boolean | undefined> {
  return page.evaluate(() => (window as { kept?: boolean }).kept);
}

test("Join the lobby in the popup seats a parked player, and the host plays on", async ({
  autodarts,
  display,
}) => {
  const page = await display.openAutodarts();
  const popup = await display.saveAccounts(page, [ALICE, BOB, CAROL]);
  // Carol plays, and opens a lobby on the board of the display.
  const lobby = autodarts.openLobby(CAROL);
  await page.goto(`${new URL(page.url()).origin}/lobby/${lobby}`);
  await expectPlayer(page, CAROL);
  await mark(page);
  await popup.reopen();

  // Each parked player offers the join; Carol sits in the lobby on the page already.
  await expect(joinOf(popup.page, ALICE)).toBeVisible();
  await expect(joinOf(popup.page, BOB)).toBeVisible();
  await expect(joinOf(popup.page, CAROL)).toBeHidden();
  await expect(joinOf(popup.page, ALICE)).toHaveText(display.t("joinLobby"));
  await expect(joinOf(popup.page, ALICE)).toHaveAccessibleName(
    display.t("joinLobbyAs", ALICE.name),
  );

  const renewals = autodarts.count("refresh", ALICE);
  await joinOf(popup.page, ALICE).click();
  await popup.ready();

  await popup.expectStatus(display.t("joinedLobby", ALICE.name));
  await expect(popup.tile(ALICE).locator(".chip")).toHaveText(
    display.t("inLobby"),
  );
  // Below her tile, the quieter "Join again" stays, for when the host takes her out.
  await expect(joinOf(popup.page, ALICE)).toHaveText(display.t("joinAgain"));
  await expect(joinOf(popup.page, ALICE)).toHaveAccessibleName(
    display.t("joinAgainAs", ALICE.name),
  );
  await expect(joinOf(popup.page, BOB)).toHaveText(display.t("joinLobby"));
  expect(autodarts.seatsOf(lobby)).toEqual([CAROL.id, ALICE.id]);
  // One renewal of Alice's parked session made the access token of her seat.
  expect(autodarts.count("refresh", ALICE)).toBe(renewals + 1);
  expect(autodarts.count("seat", ALICE)).toBe(1);
  // No switch and no reload: the page kept its player and its mark.
  await expectPlayer(page, CAROL);
  expect(await kept(page)).toBe(true);
  await popup.expectAccounts([ALICE, BOB, CAROL], CAROL);

  // The popup opened anew still knows her seat, and Alice keeps her parked session.
  await popup.reopen();
  await expect(popup.tile(ALICE).locator(".chip")).toHaveText(
    display.t("inLobby"),
  );
  expect(autodarts.sessionsOf(ALICE)).toBe(1);

  // The rotated token of the join was saved: a switch to Alice later works with it,
  // and the fake fails any token that reaches it a second time.
  await popup.tap(ALICE);
  await expectPlayer(page, ALICE);
});

test("Join again keeps a seat that Autodarts still has, and seats a player whom the host took out", async ({
  autodarts,
  display,
}) => {
  const page = await display.openAutodarts();
  const popup = await display.saveAccounts(page, [ALICE, CAROL]);
  const lobby = autodarts.openLobby(CAROL);
  await page.goto(`${new URL(page.url()).origin}/lobby/${lobby}`);
  await expectPlayer(page, CAROL);
  await popup.reopen();
  await joinOf(popup.page, ALICE).click();
  await popup.ready();
  await popup.expectStatus(display.t("joinedLobby", ALICE.name));

  // Alice still sits there: the tap asks for no second seat, and the popup says so.
  await joinOf(popup.page, ALICE).click();
  await popup.ready();
  await popup.expectStatus(display.t("joinKept", ALICE.name));
  expect(autodarts.count("seat", ALICE)).toBe(1);
  expect(autodarts.seatsOf(lobby)).toEqual([CAROL.id, ALICE.id]);

  // Carol takes Alice out on Autodarts. The extension doesn't watch the lobby, so her
  // tile still says "In the lobby", and "Join again" seats her once more.
  autodarts.leave(lobby, ALICE);
  await popup.reopen();
  await expect(popup.tile(ALICE).locator(".chip")).toHaveText(
    display.t("inLobby"),
  );
  await joinOf(popup.page, ALICE).click();
  await popup.ready();
  await popup.expectStatus(display.t("joinedLobby", ALICE.name));
  expect(autodarts.seatsOf(lobby)).toEqual([CAROL.id, ALICE.id]);
  expect(autodarts.count("seat", ALICE)).toBe(2);
  // Carol plays on the page as before.
  await expectPlayer(page, CAROL);
});

test("Join the lobby in the switcher on the page seats a parked player without a switch", async ({
  autodarts,
  display,
}) => {
  const page = await display.openAutodarts();
  const popup = await display.saveAccounts(page, [ALICE, BOB]);
  await popup.page.close();
  // Bob plays, and hosts a lobby on the board display.
  const lobby = autodarts.openLobby(BOB);
  await page.goto(`${new URL(page.url()).origin}/lobby/${lobby}`);
  await expectPlayer(page, BOB);
  await mark(page);

  const switcher = await display.openSwitcher(page);
  await expect(joinOf(switcher, BOB)).toBeHidden();
  // The player who plays has one frame, the border of their card, around the whole
  // tile, though the card with the join beside it is the taller one; and after a tap,
  // the focus that the switcher gives the first tile shows no ring, which would be a
  // second frame on the tile of the player who plays.
  expect(
    await profileOf(switcher, BOB).evaluate(
      (card) =>
        card.clientHeight -
        (card.querySelector(".tile") as HTMLElement).offsetHeight,
    ),
  ).toBe(0);
  const first = switcher.locator("#profiles .tile").first();
  await expect
    .poll(() => first.evaluate((tile) => tile === document.activeElement))
    .toBe(true);
  await expect(first).toHaveCSS("outline-style", "none");
  await joinOf(switcher, ALICE).click();

  await expect(switcher.locator("#status")).toHaveText(
    display.t("joinedLobby", ALICE.name),
  );
  await expect(profileOf(switcher, ALICE).locator(".chip")).toHaveText(
    display.t("inLobby"),
  );
  expect(autodarts.seatsOf(lobby)).toEqual([BOB.id, ALICE.id]);
  // The switcher stays open over the page, which kept its player and its mark.
  expect(page.frames()).toContain(switcher);
  await expectPlayer(page, BOB);
  expect(await kept(page)).toBe(true);
});

test("no tile offers a join on any other page of Autodarts, and a join there spends no token", async ({
  autodarts,
  display,
}) => {
  const page = await display.openAutodarts();
  const popup = await display.saveAccounts(page, [ALICE, BOB]);
  await expect(joinOf(popup.page, ALICE)).toBeHidden();
  const renewals = autodarts.count("refresh", ALICE);

  // A request of a popup that still showed the lobby, after the page left it.
  const reply = await popup.page.evaluate(
    (account) =>
      chrome.runtime.sendMessage({
        type: "popup",
        action: "join",
        id: account,
      }),
    ALICE.id,
  );

  expect(reply).toMatchObject({ ok: false, reason: "noLobby" });
  expect(autodarts.count("refresh", ALICE)).toBe(renewals);
  await expectPlayer(page, BOB);
});
