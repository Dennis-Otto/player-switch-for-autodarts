// What the extension does when a session has died or no Autodarts tab is open,
// against the fake Autodarts of fixtures.ts.
import { ALICE, BOB, expect, expectPlayer, test } from "./fixtures.ts";

test("a remembered password signs an account back in when its parked session has died", async ({
  autodarts,
  display,
}) => {
  const page = await display.openAutodarts();
  const popup = await display.saveAccounts(page, [ALICE, BOB]);

  await popup.manage();
  const alice = popup.tile(ALICE);
  await alice.locator(".toggle-remember").click();
  await alice.locator(".cred-username").fill(ALICE.username);
  await alice.locator(".cred-password").fill(ALICE.password);
  await alice.locator(".remember [type=submit]").click();
  await popup.ready();
  await expect(popup.tile(ALICE).locator(".toggle-remember")).toHaveText(
    display.t("forgetPassword"),
  );
  await popup.manage();

  autodarts.end(ALICE);
  await popup.tap(ALICE);
  await expectPlayer(page, ALICE);
  await popup.expectAccounts([ALICE, BOB], ALICE);
  expect(autodarts.count("login", ALICE)).toBe(2);
});

test("an account whose session has died and that remembers no password has to sign in again", async ({
  autodarts,
  display,
}) => {
  const page = await display.openAutodarts();
  const popup = await display.saveAccounts(page, [ALICE, BOB]);

  autodarts.end(ALICE);
  await popup.tap(ALICE);
  await popup.expectStatus(display.t("switchSignIn", ALICE.name), true);
  await expect(popup.tile(ALICE).locator(".chip")).toHaveText(
    display.t("needsSignIn"),
  );
  // Bob plays on.
  await popup.expectAccounts([ALICE, BOB], BOB);
  await expectPlayer(page, BOB);
});

test("with no Autodarts tab, Open Autodarts opens one", async ({ display }) => {
  const page = await display.openAutodarts();
  const popup = await display.saveAccounts(page, [ALICE]);
  await page.close();

  await popup.reopen();
  const open = popup.page.getByRole("button", { name: display.t("openPage") });
  await expect(open).toBeVisible();
  await open.click();
  await expectPlayer(await display.openedAutodarts(), ALICE);
  await popup.ready();
  await expect(open).toBeHidden();
});

test("with no Autodarts tab, a tap opens Autodarts and switches there", async ({
  display,
}) => {
  const page = await display.openAutodarts();
  const popup = await display.saveAccounts(page, [ALICE, BOB]);
  await page.close();

  await popup.reopen();
  // The tap waits until the page that the extension opened has started.
  await popup.tap(ALICE, 20_000);
  await expectPlayer(await display.openedAutodarts(), ALICE);
  await popup.expectAccounts([ALICE, BOB], ALICE);
});
