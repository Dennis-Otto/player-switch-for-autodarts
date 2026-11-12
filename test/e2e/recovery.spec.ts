// What the extension does when a session has died or no Autodarts tab is open,
// against the fake Autodarts of fixtures.ts.
import { SESSION_KEY } from "../../src/autodarts.ts";
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
  // Remembering signed Alice in once to check the password; she keeps that session.
  expect(autodarts.count("login", ALICE)).toBe(2);
  expect(autodarts.sessionsOf(ALICE)).toBe(1);

  autodarts.end(ALICE);
  await popup.tap(ALICE);
  await expectPlayer(page, ALICE);
  await popup.expectAccounts([ALICE, BOB], ALICE);
  expect(autodarts.count("login", ALICE)).toBe(3);
});

test("Remember password refuses a wrong password and the sign-in of another account at once", async ({
  autodarts,
  display,
}) => {
  const page = await display.openAutodarts();
  const popup = await display.saveAccounts(page, [ALICE, BOB]);

  await popup.manage();
  await popup.tile(ALICE).locator(".toggle-remember").click();
  const form = popup.tile(ALICE).locator(".remember");
  await form.locator(".cred-username").fill(ALICE.username);
  await form.locator(".cred-password").fill(`${ALICE.password}-typo`);
  await form.locator("[type=submit]").click();
  await popup.expectStatus(display.t("rememberRefused"), true);
  // The form opens again with the username, so only the password is typed anew.
  await expect(popup.tile(ALICE).locator(".remember")).toBeVisible();
  await expect(form.locator(".cred-username")).toHaveValue(ALICE.username);
  await expect(form.locator(".cred-password")).toHaveValue("");
  await expect(form.locator(".cred-password")).toBeFocused();

  await form.locator(".cred-username").fill(BOB.username);
  await form.locator(".cred-password").fill(BOB.password);
  await form.locator("[type=submit]").click();
  await popup.expectStatus(display.t("rememberOtherAccount", ALICE.name), true);
  await expect(popup.tile(ALICE).locator(".toggle-remember")).toHaveText(
    display.t("rememberPassword"),
  );
  // The session of Bob's sign-in ended at once; Bob plays on the page as before.
  expect(autodarts.sessionsOf(BOB)).toBe(1);
  await popup.manage();
  await popup.expectAccounts([ALICE, BOB], BOB);
  await expectPlayer(page, BOB);
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

test("an account that remembers its password and signs out on the page stays ready, and a tap signs it in", async ({
  autodarts,
  display,
}) => {
  const page = await display.openAutodarts();
  const popup = await display.saveAccounts(page, [ALICE, BOB]);

  // Bob plays and remembers his password.
  await popup.manage();
  const bob = popup.tile(BOB);
  await bob.locator(".toggle-remember").click();
  await bob.locator(".cred-username").fill(BOB.username);
  await bob.locator(".cred-password").fill(BOB.password);
  await bob.locator(".remember [type=submit]").click();
  await popup.ready();
  await popup.manage();
  // Remembering signed Bob in once to check the password; he plays, so the page keeps
  // its own session.
  expect(autodarts.count("login", BOB)).toBe(2);

  // In the page itself, someone signs out.
  await page.evaluate(
    (key) => window.localStorage.removeItem(key),
    SESSION_KEY,
  );
  await page.reload();
  await popup.reopen();

  // Nothing tried his password yet, so his tile doesn't ask for a sign-in.
  await popup.expectAccounts([ALICE, BOB], null);
  await expect(popup.tile(BOB).locator(".chip")).toBeHidden();
  await popup.tap(BOB);
  await expectPlayer(page, BOB);
  await popup.expectAccounts([ALICE, BOB], BOB);
  // The tap signed him in with his remembered password.
  expect(autodarts.count("login", BOB)).toBe(3);
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
