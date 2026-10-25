// Saving, adding and removing accounts, in the real popup and the real service
// worker, against the fake Autodarts of fixtures.ts.
import { ALICE, BOB, CAROL, expect, expectPlayer, test } from "./fixtures.ts";

test("the install waits for the first sign-in and saves that account by itself", async ({
  display,
}) => {
  const popup = await display.popup();
  await expect(popup.page.locator("#adding")).toBeVisible();
  await expect(popup.page.locator("#adding p")).toHaveText(
    display.t("addingText"),
  );

  const page = await display.openAutodarts();
  await display.signIn(page, ALICE);

  await popup.reopen();
  await popup.expectAccounts([ALICE], ALICE);
  await expect(popup.page.locator("#adding")).toBeHidden();
  // The page plays on with the session that the extension renewed and wrote back.
  await expectPlayer(page, ALICE);
});

test("Save account keeps a session that was signed in on the page", async ({
  display,
}) => {
  const popup = await display.popup();
  // Without the window of the install, a sign-in is never saved by itself.
  await popup.page.locator("#stop-adding").click();
  await popup.ready();
  await expect(popup.page.locator("#adding")).toBeHidden();
  await popup.expectStatus(display.t("empty"));

  const page = await display.openAutodarts();
  await display.signIn(page, ALICE);
  await popup.reopen();
  await popup.expectAccounts([], null);
  await expect(popup.page.locator("#unsaved")).toBeVisible();

  await popup.page.locator("#adopt").click();
  await popup.ready();
  await popup.expectAccounts([ALICE], ALICE);
  await expect(popup.page.locator("#unsaved")).toBeHidden();
  await expectPlayer(page, ALICE);
});

test("Add account signs the page out, parks the player and saves the next sign-in", async ({
  autodarts,
  display,
}) => {
  const page = await display.openAutodarts();
  const popup = await display.saveAccounts(page, [ALICE]);

  await popup.page.locator("#add").click();
  await popup.ready();
  await expect(popup.page.locator("#adding")).toBeVisible();
  await expectPlayer(page, null);
  // Alice's session is parked, not ended.
  expect(autodarts.sessionsOf(ALICE)).toBe(1);

  await display.signIn(page, BOB);
  await popup.reopen();
  await popup.expectAccounts([ALICE, BOB], BOB);
});

test("Remove account forgets the account and its session", async ({
  display,
}) => {
  const page = await display.openAutodarts();
  const popup = await display.saveAccounts(page, [ALICE, BOB, CAROL]);

  await popup.manage();
  await popup.tile(BOB).locator(".remove").click();
  const dialog = popup.page.locator("dialog.confirm");
  await expect(dialog).toContainText(display.t("removeConfirm", BOB.name));
  await dialog.getByRole("button", { name: display.t("remove") }).click();
  await popup.ready();

  await popup.expectAccounts([ALICE, CAROL], CAROL);
  const stored = JSON.stringify(await display.stored());
  expect(stored).not.toContain(BOB.id);
  expect(stored).not.toContain("refresh-bob-");
});
