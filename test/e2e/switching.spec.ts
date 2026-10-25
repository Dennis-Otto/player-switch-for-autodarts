// Switching players, from the popup and from the switcher in the page, against the
// fake Autodarts of fixtures.ts, which fails every test that sends a refresh token
// a second time.
import { ALICE, BOB, expect, expectPlayer, test } from "./fixtures.ts";

test("a tap switches A to B and back, with the session of each kept fresh", async ({
  autodarts,
  display,
}) => {
  const page = await display.openAutodarts();
  const popup = await display.saveAccounts(page, [ALICE, BOB]);

  const renewals = autodarts.count("refresh", ALICE);
  await popup.tap(ALICE);
  await popup.expectAccounts([ALICE, BOB], ALICE);
  await expectPlayer(page, ALICE);
  // The extension renewed Alice's parked session, and the page renewed it again as it
  // started with it: each token went to Autodarts once.
  expect(autodarts.count("refresh", ALICE)).toBe(renewals + 2);

  await popup.tap(BOB);
  await popup.expectAccounts([ALICE, BOB], BOB);
  await expectPlayer(page, BOB);

  await popup.tap(ALICE);
  await expectPlayer(page, ALICE);
  // Every player still has one session, the parked one and the one in the page.
  expect(autodarts.sessionsOf(ALICE)).toBe(1);
  expect(autodarts.sessionsOf(BOB)).toBe(1);
});

test("a switch reloads every other Autodarts tab with the new player", async ({
  display,
}) => {
  const first = await display.openAutodarts();
  const popup = await display.saveAccounts(first, [ALICE, BOB]);
  const second = await display.openAutodarts();
  await expectPlayer(second, BOB);

  await popup.tap(ALICE);
  await expectPlayer(first, ALICE);
  await expectPlayer(second, ALICE);
});

test("a double tap switches once", async ({ autodarts, display }) => {
  const page = await display.openAutodarts();
  const popup = await display.saveAccounts(page, [ALICE, BOB]);
  const renewals = autodarts.count("refresh", ALICE);

  await popup.tile(ALICE).locator(".tile").dblclick();
  await popup.ready();
  await expectPlayer(page, ALICE);
  expect(autodarts.count("refresh", ALICE)).toBe(renewals + 2);
});

test("taps in two popups at once wait for each other and spend no token twice", async ({
  autodarts,
  display,
}) => {
  const page = await display.openAutodarts();
  const popup = await display.saveAccounts(page, [ALICE, BOB]);
  const other = await display.popup();
  const renewals = autodarts.count("refresh", ALICE);

  await Promise.all([popup.tap(ALICE), other.tap(ALICE)]);
  await expectPlayer(page, ALICE);
  await popup.reopen();
  await popup.expectAccounts([ALICE, BOB], ALICE);
  // The second tap found Alice playing and sent nothing.
  expect(autodarts.count("refresh", ALICE)).toBe(renewals + 2);
});

test("a switch during a match asks first and spends no token on a no", async ({
  autodarts,
  display,
}) => {
  const page = await display.openAutodarts();
  const popup = await display.saveAccounts(page, [ALICE, BOB]);
  await page.goto("https://play.autodarts.com/matches/0f6d4c2e");
  await expectPlayer(page, BOB);
  const renewals = autodarts.count("refresh", ALICE);

  const dialog = popup.page.locator("dialog.confirm");
  await popup.tile(ALICE).locator(".tile").click();
  await expect(dialog).toContainText(display.t("matchTitle"));
  await dialog.getByRole("button", { name: display.t("matchCancel") }).click();
  await popup.ready();
  await popup.expectAccounts([ALICE, BOB], BOB);
  expect(autodarts.count("refresh", ALICE)).toBe(renewals);

  await popup.tile(ALICE).locator(".tile").click();
  await dialog.getByRole("button", { name: display.t("matchConfirm") }).click();
  await popup.ready();
  await expectPlayer(page, ALICE);
});

test("the switcher in the page switches players on a display without a toolbar", async ({
  display,
}) => {
  const page = await display.openAutodarts();
  const popup = await display.saveAccounts(page, [ALICE, BOB]);
  await popup.page.close();

  // The button sits in the bottom right corner, in a closed shadow root that no
  // selector reaches, so the test taps where it shows, as a finger does.
  const viewport = page.viewportSize() ?? { width: 0, height: 0 };
  const corner = { x: viewport.width - 16 - 28, y: viewport.height - 16 - 28 };
  await expect
    .poll(() =>
      page.evaluate(
        ({ x, y }) => document.elementFromPoint(x, y)?.localName,
        corner,
      ),
    )
    .toBe("player-switch-ui");
  await page.mouse.click(corner.x, corner.y);

  await expect
    .poll(() =>
      page.frames().some((frame) => frame.url().endsWith("/switcher.html")),
    )
    .toBe(true);
  const switcher = page
    .frames()
    .find((frame) => frame.url().endsWith("/switcher.html"));
  if (switcher === undefined) {
    throw new Error("The switcher closed again");
  }
  await expect(switcher.locator("#profiles .profile.active .name")).toHaveText(
    BOB.name,
  );
  await switcher
    .locator("#profiles .profile .tile")
    .filter({ hasText: ALICE.name })
    .click();
  await expectPlayer(page, ALICE);
});
