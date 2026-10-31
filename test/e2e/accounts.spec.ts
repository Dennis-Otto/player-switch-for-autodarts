// Saving, adding and removing accounts, in the real popup and the real service
// worker, against the fake Autodarts of fixtures.ts.
import { SESSION_KEY } from "../../src/autodarts.ts";
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

test("Add account parks a session signed in right in the page with its own account", async ({
  display,
}) => {
  const page = await display.openAutodarts();
  const popup = await display.saveAccounts(page, [ALICE, BOB]);

  // Bob plays. In the page itself, someone signs out and signs in as Alice.
  await page.evaluate(
    (key) => window.localStorage.removeItem(key),
    SESSION_KEY,
  );
  await page.reload();
  await display.signIn(page, ALICE);

  await popup.page.locator("#add").click();
  await popup.ready();
  await expect(popup.page.locator("#adding")).toBeVisible();
  await expectPlayer(page, null);
  await expect(popup.tile(BOB).locator(".chip")).toHaveText(
    display.t("needsSignIn"),
  );

  await popup.tap(ALICE);
  await expectPlayer(page, ALICE);
  await popup.expectAccounts([ALICE, BOB], ALICE);
});

test("Remove account ends the session at Autodarts and forgets the account", async ({
  autodarts,
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

  await popup.expectStatus(display.t("removed", BOB.name));
  await popup.expectAccounts([ALICE, CAROL], CAROL);
  // Bob's parked session is over at Autodarts, not only gone from the display.
  expect(autodarts.count("logout", BOB)).toBe(1);
  expect(autodarts.sessionsOf(BOB)).toBe(0);
  expect(autodarts.sessionsOf(ALICE)).toBe(1);
  const stored = JSON.stringify(await display.stored());
  expect(stored).not.toContain(BOB.id);
  expect(stored).not.toContain("refresh-bob-");
  // Carol plays on.
  await expectPlayer(page, CAROL);
});

test("Remove account of the player on the page asks during a match, then signs the page out", async ({
  autodarts,
  display,
}) => {
  const page = await display.openAutodarts();
  const popup = await display.saveAccounts(page, [ALICE, BOB]);
  await page.goto("https://play.autodarts.com/matches/0f6d4c2e");
  await expectPlayer(page, BOB);

  await popup.manage();
  await popup.tile(BOB).locator(".remove").click();
  const dialog = popup.page.locator("dialog.confirm[open]");
  await dialog.getByRole("button", { name: display.t("remove") }).click();
  // The page would sign out, and with it the match would end: the person says first.
  await expect(dialog).toContainText(display.t("matchSignOutText"));
  await dialog.getByRole("button", { name: display.t("matchCancel") }).click();
  await popup.ready();
  await popup.expectAccounts([ALICE, BOB], BOB);
  expect(autodarts.count("logout", BOB)).toBe(0);

  await popup.tile(BOB).locator(".remove").click();
  await dialog.getByRole("button", { name: display.t("remove") }).click();
  await dialog
    .getByRole("button", { name: display.t("matchSignOutConfirm") })
    .click();
  await popup.ready();
  await popup.expectStatus(display.t("removed", BOB.name));
  await popup.expectAccounts([ALICE], null);
  await expectPlayer(page, null);
  expect(autodarts.sessionsOf(BOB)).toBe(0);
  expect(autodarts.sessionsOf(ALICE)).toBe(1);
});

test("Forget all accounts ends every session, leaves nothing behind and starts over", async ({
  autodarts,
  display,
}) => {
  const page = await display.openAutodarts();
  const popup = await display.saveAccounts(page, [ALICE, BOB, CAROL]);
  const forgetAll = popup.page.locator("#forget-all");
  await expect(forgetAll).toBeHidden();

  await popup.manage();
  await forgetAll.click();
  const dialog = popup.page.locator("dialog.confirm[open]");
  await expect(dialog).toContainText(display.t("forgetAllConfirm"));
  await dialog.getByRole("button", { name: display.t("forgetAll") }).click();
  await popup.ready();

  await popup.expectStatus(display.t("forgotAll"));
  await popup.expectAccounts([], null);
  await expect(forgetAll).toBeHidden();
  await expect(popup.page.locator("#manage")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expectPlayer(page, null);
  for (const account of [ALICE, BOB, CAROL]) {
    expect(autodarts.sessionsOf(account)).toBe(0);
  }
  expect(await display.stored()).toEqual({});

  // The extension works as after its install: a new sign-in is saved with a new key.
  await popup.page.locator("#add").click();
  await popup.ready();
  await display.signIn(page, ALICE);
  await popup.reopen();
  await popup.expectAccounts([ALICE], ALICE);
  // Its session is sealed with a new key that is stored, not with the deleted one that
  // the worker still had in memory, so it opens after a restart of the browser as well.
  const keys = await display.worker.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const request = indexedDB.open("vault");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const count = database
            .transaction("keys")
            .objectStore("keys")
            .count();
          count.onsuccess = () => {
            database.close();
            resolve(count.result);
          };
        };
      }),
  );
  expect(keys).toBe(1);
});
