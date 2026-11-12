// The venue mode for a club or pub, against the fake Autodarts of fixtures.ts: the
// PINs that the service worker checks, whichever view asks it.
import {
  ALICE,
  BOB,
  expect,
  expectPlayer,
  type Popup,
  test,
} from "./fixtures.ts";

/** Sends a request of the venue mode from a page of the extension, as the options page does. */
function venue(
  popup: Popup,
  message: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return popup.page.evaluate(
    (request) => chrome.runtime.sendMessage({ type: "venue", ...request }),
    message,
  );
}

test("an account with a PIN switches only with its PIN, and a wrong one spends no token", async ({
  autodarts,
  display,
}) => {
  const page = await display.openAutodarts();
  const popup = await display.saveAccounts(page, [ALICE, BOB]);
  expect(
    await venue(popup, { action: "playerPin", id: ALICE.id, pin: "4711" }),
  ).toMatchObject({ ok: true });
  await popup.reopen();
  await expect(popup.tile(ALICE).locator(".pin-mark")).toBeVisible();
  await expect(popup.tile(BOB).locator(".pin-mark")).toHaveCount(0);
  const renewals = autodarts.count("refresh", ALICE);

  await popup.tile(ALICE).locator(".tile").click();
  const dialog = popup.page.locator("dialog.pin");
  await expect(dialog).toBeVisible();
  await dialog.locator(".pin-input").fill("1234");
  await dialog.locator(".pin-input").press("Enter");
  await expect(dialog.locator(".pin-problem")).toHaveText(
    display.t("pinWrong"),
  );
  expect(autodarts.count("refresh", ALICE)).toBe(renewals);
  await expectPlayer(page, BOB);

  await dialog.locator(".pin-input").fill("4711");
  await dialog.locator(".pin-input").press("Enter");
  await popup.ready();
  await expectPlayer(page, ALICE);
  await popup.expectAccounts([ALICE, BOB], ALICE);
});

test("a request that goes around the popup gets no further without the PIN", async ({
  display,
}) => {
  const page = await display.openAutodarts();
  const popup = await display.saveAccounts(page, [ALICE, BOB]);
  await venue(popup, { action: "playerPin", id: ALICE.id, pin: "4711" });
  await venue(popup, { action: "managerPin", pin: "2468" });

  const send = (message: Record<string, unknown>) =>
    popup.page.evaluate(
      (request) => chrome.runtime.sendMessage({ type: "popup", ...request }),
      message,
    );
  expect(await send({ action: "switch", id: ALICE.id })).toMatchObject({
    ok: false,
    reason: "pin",
    pin: "player",
  });
  expect(await send({ action: "removeAccount", id: BOB.id })).toMatchObject({
    ok: false,
    reason: "pin",
    pin: "manager",
  });
  // Nor does a change of the venue mode, not even of the manager PIN itself.
  expect(await venue(popup, { action: "managerPin", pin: null })).toMatchObject(
    { ok: false, reason: "pin", pin: "manager" },
  );
  await expectPlayer(page, BOB);
  await popup.reopen();
  await popup.expectAccounts([ALICE, BOB], BOB);
});

test("Manage accounts opens with the manager PIN, and a removal takes the PIN along", async ({
  display,
}) => {
  const page = await display.openAutodarts();
  const popup = await display.saveAccounts(page, [ALICE, BOB]);
  await venue(popup, { action: "playerPin", id: ALICE.id, pin: "4711" });
  await venue(popup, { action: "managerPin", pin: "2468" });
  await popup.reopen();

  await popup.manage();
  const dialog = popup.page.locator("dialog.pin");
  await expect(dialog.locator("h2")).toHaveText(display.t("managerPinTitle"));
  await dialog.locator(".pin-input").fill("2468");
  await dialog.locator(".pin-input").press("Enter");
  await expect(popup.page.locator("#manage")).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await popup.tile(ALICE).locator(".remove").click();
  await popup.page
    .locator("dialog.confirm[open]")
    .getByRole("button", { name: display.t("remove") })
    .click();
  await popup.ready();
  await popup.expectAccounts([BOB], BOB);
  const stored = await display.stored();
  expect(stored.venue).toMatchObject({ players: {} });
});

test("without the manager, the player who plays protects their account with a PIN and removes it with that PIN", async ({
  autodarts,
  display,
}) => {
  const page = await display.openAutodarts();
  const popup = await display.saveAccounts(page, [ALICE, BOB]);
  await venue(popup, { action: "managerPin", pin: "2468" });
  await popup.reopen();

  // Bob plays and has no PIN: his tile offers one, and Alice's, parked, nothing.
  const own = popup.tile(BOB).locator(".own");
  await expect(own).toHaveText(display.t("protectOwn"));
  await expect(own).toHaveAttribute(
    "aria-label",
    `${display.t("protectOwn")}: ${BOB.name}`,
  );
  await expect(popup.tile(ALICE).locator(".own")).toBeHidden();

  await own.click();
  const dialog = popup.page.locator("dialog.pin");
  await expect(dialog.locator("h2")).toHaveText(
    display.t("newPinFor", BOB.name),
  );
  await dialog.locator(".pin-input").fill("4711");
  await dialog.locator(".pin-input").press("Enter");
  await expect(dialog.locator("h2")).toHaveText(display.t("repeatPinTitle"));
  await dialog.locator(".pin-input").fill("4711");
  await dialog.locator(".pin-input").press("Enter");
  await popup.ready();
  await popup.expectStatus(display.t("protectedOwn", BOB.name));
  await expect(popup.tile(BOB).locator(".pin-mark")).toBeVisible();
  await expect(own).toHaveText(display.t("removeOwn"));

  // The removal asks for a yes and Bob's PIN, never the manager PIN.
  await own.click();
  await popup.page
    .locator("dialog.confirm[open]")
    .getByRole("button", { name: display.t("remove") })
    .click();
  await expect(dialog.locator("h2")).toHaveText(
    display.t("pinTitle", BOB.name),
  );
  await expect(dialog.locator("#pin-text")).toHaveText(
    display.t("removeOwnPinText"),
  );
  await dialog.locator(".pin-input").fill("4711");
  await dialog.locator(".pin-input").press("Enter");
  await popup.ready();
  await popup.expectStatus(display.t("removed", BOB.name));
  await popup.expectAccounts([ALICE], null);
  await expectPlayer(page, null);
  expect(autodarts.sessionsOf(BOB)).toBe(0);
  const stored = await display.stored();
  expect(stored.venue).toMatchObject({ players: {} });
});

test("the extension keeps no PIN, only a salted hash of it", async ({
  display,
}) => {
  const page = await display.openAutodarts();
  const popup = await display.saveAccounts(page, [ALICE]);
  // Eight digits, which no random salt or hash spells by chance.
  await venue(popup, { action: "playerPin", id: ALICE.id, pin: "47114711" });
  await venue(popup, { action: "managerPin", pin: "24682468" });

  const stored = await display.stored();
  expect(JSON.stringify(stored)).not.toContain("47114711");
  expect(JSON.stringify(stored)).not.toContain("24682468");
  expect(stored.venue).toMatchObject({
    manager: { iterations: 600_000 },
    players: { [ALICE.id]: { iterations: 600_000 } },
  });
});

test("the return after a break looks once a minute while it is on, and a tap on the page counts as input", async ({
  display,
}) => {
  const page = await display.openAutodarts();
  const popup = await display.saveAccounts(page, [ALICE, BOB]);
  expect(
    await display.worker.evaluate(() => chrome.alarms.get("venue-idle")),
  ).toBeUndefined();

  await venue(popup, { action: "idle", minutes: 10, house: ALICE.id });
  await expect
    .poll(() => display.worker.evaluate(() => chrome.alarms.get("venue-idle")))
    .toMatchObject({ periodInMinutes: 1 });

  // A tap on the page is an input, which the worker keeps in the session storage, once
  // the page has heard that the return is on.
  await display.worker.evaluate(() =>
    chrome.storage.session.remove("venueActivity"),
  );
  await expect
    .poll(async () => {
      await page.mouse.click(5, 5);
      return display.worker.evaluate(() =>
        chrome.storage.session.get("venueActivity"),
      );
    })
    .toHaveProperty("venueActivity");

  await venue(popup, { action: "idle", minutes: null, house: null });
  await expect
    .poll(() => display.worker.evaluate(() => chrome.alarms.get("venue-idle")))
    .toBeUndefined();
});
