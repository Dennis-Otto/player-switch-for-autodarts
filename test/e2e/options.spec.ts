// The options page of the loaded extension, against the fake Autodarts of fixtures.ts:
// the venue mode for a club or pub, which the page sets through the service worker,
// and the button of the switcher, whose settings the page saves and every open
// Autodarts tab follows. Each test taps through the page itself, as the person who
// runs the display does.
import {
  ALICE,
  BOB,
  buttonCorner,
  expect,
  expectPlayer,
  test,
} from "./fixtures.ts";

test("a manager PIN set on the page locks it, which opens only with that PIN", async ({
  display,
}) => {
  const options = await display.options();
  await options.expectOpen(true);
  await expect(options.page.locator("#manager-state")).toHaveText(
    display.t("managerPinOff"),
  );
  await expect(options.page.locator("#remove-manager")).toBeHidden();

  // A slip of a finger in the repeat sets no PIN: the page asks for it again.
  await options.page.locator("#set-manager").click();
  await options.choosePin(display.t("newManagerPinTitle"), "2468", "2469");
  await options.enterPin(
    display.t("newManagerPinTitle"),
    "2468",
    display.t("pinMismatch"),
  );
  await options.enterPin(display.t("repeatPinTitle"), "2468");
  await options.expectStatus(display.t("saved"));
  await expect(options.page.locator("#manager-state")).toHaveText(
    display.t("managerPinOn"),
  );
  await expect(options.page.locator("#set-manager")).toHaveText(
    display.t("changeManagerPin"),
  );
  await expect(options.page.locator("#remove-manager")).toBeVisible();
  expect((await display.stored()).venue).toMatchObject({
    manager: { iterations: 600_000 },
  });

  // Whoever opens the page later finds it locked.
  await options.reopen();
  await options.expectOpen(false);

  // A wrong PIN opens nothing, the page asks again, and a cancel keeps it locked.
  await options.page.locator("#unlock").click();
  await options.enterPin(display.t("managerPinTitle"), "1357");
  await expect(options.pinDialog().locator(".pin-problem")).toHaveText(
    display.t("pinWrong"),
  );
  await options
    .pinDialog()
    .getByRole("button", { name: display.t("cancel") })
    .click();
  await expect(options.pinDialog()).toHaveCount(0);
  await options.expectOpen(false);

  await options.page.locator("#unlock").click();
  await options.enterPin(display.t("managerPinTitle"), "2468");
  await options.expectOpen(true);
  await expect(options.page.locator("#show-button")).toBeFocused();

  // The PIN that opened the page goes along with the next change, without a question.
  await options.page.locator("#remove-manager").click();
  await options.page
    .locator("dialog.confirm[open]")
    .getByRole("button", { name: display.t("removeManagerPin") })
    .click();
  await expect(options.page.locator("#manager-state")).toHaveText(
    display.t("managerPinOff"),
  );
  await expect(options.pinDialog()).toHaveCount(0);
  await options.reopen();
  await options.expectOpen(true);
  expect((await display.stored()).venue).toMatchObject({ manager: null });
});

test("a PIN given to an account on the page makes the popup ask for it before it switches", async ({
  display,
}) => {
  const page = await display.openAutodarts();
  const popup = await display.saveAccounts(page, [ALICE, BOB]);
  const options = await display.options();
  const row = options.pinRow(ALICE);
  await expect(row.locator(".username")).toHaveText(
    `${ALICE.username} · ${display.t("noPin")}`,
  );

  await row
    .getByRole("button", { name: `${display.t("setPin")}: ${ALICE.name}` })
    .click();
  await options.choosePin(display.t("newPinFor", ALICE.name), "4711");
  await options.expectStatus(display.t("saved"));
  await expect(row.locator(".username")).toHaveText(
    `${ALICE.username} · ${display.t("pinSet")}`,
  );
  // The page draws the list anew, and the focus stays on the control of the account.
  await expect(
    row.getByRole("button", {
      name: `${display.t("changePin")}: ${ALICE.name}`,
    }),
  ).toBeFocused();
  await expect(options.pinRow(BOB).locator(".username")).toHaveText(
    `${BOB.username} · ${display.t("noPin")}`,
  );

  await popup.reopen();
  await expect(popup.tile(ALICE).locator(".pin-mark")).toBeVisible();
  await expect(popup.tile(BOB).locator(".pin-mark")).toHaveCount(0);
  await popup.tile(ALICE).locator(".tile").click();
  const dialog = popup.page.locator("dialog.pin");
  await expect(dialog).toBeVisible();
  await dialog.locator(".pin-input").fill("4711");
  await dialog.locator(".pin-input").press("Enter");
  await popup.ready();
  await expectPlayer(page, ALICE);

  // The PIN goes only with itself, also without a manager PIN (decision 0019): a wrong
  // one keeps it, the right one takes it away, and the account switches with a tap again.
  await row
    .getByRole("button", { name: `${display.t("removePin")}: ${ALICE.name}` })
    .click();
  const title = display.t("pinTitle", ALICE.name);
  await expect(options.pinDialog().locator("p").first()).toHaveText(
    display.t("changePinText"),
  );
  await options.enterPin(title, "0000");
  await options.enterPin(title, "4711", display.t("pinWrong"));
  await expect(row.locator(".username")).toHaveText(
    `${ALICE.username} · ${display.t("noPin")}`,
  );
  await expect
    .poll(async () => (await display.stored()).venue)
    .toHaveProperty("players", {});
  await popup.reopen();
  await expect(popup.tile(ALICE).locator(".pin-mark")).toHaveCount(0);
});

test("the return after a break, set on the page, is what the worker holds and shows again", async ({
  display,
}) => {
  const page = await display.openAutodarts();
  await display.saveAccounts(page, [ALICE, BOB]);
  const options = await display.options();
  const minutes = options.page.locator("#idle-minutes");
  const house = options.page.locator("#idle-house");
  await expect(minutes).toHaveValue("");
  await expect(house).toBeDisabled();

  await minutes.selectOption("10");
  // The page shows what the worker answered, once it has.
  await options.expectStatus(display.t("saved"));
  await expect(house).toBeEnabled();
  await expect(house).toHaveValue("");
  await house.selectOption({ label: ALICE.name });
  await expect
    .poll(async () => (await display.stored()).venue)
    .toMatchObject({ idleMinutes: 10, house: ALICE.id });
  await expect
    .poll(() => display.worker.evaluate(() => chrome.alarms.get("venue-idle")))
    .toMatchObject({ periodInMinutes: 1 });

  await options.reopen();
  await expect(minutes).toHaveValue("10");
  await expect(house).toHaveValue(ALICE.id);
  await expect(house).toBeEnabled();

  await minutes.selectOption("");
  await expect(house).toBeDisabled();
  await expect
    .poll(() => display.worker.evaluate(() => chrome.alarms.get("venue-idle")))
    .toBeUndefined();
  expect((await display.stored()).venue).toMatchObject({ idleMinutes: null });
});

test("the corner of the button, and whether it shows, follow in the open Autodarts tab", async ({
  display,
}) => {
  const page = await display.openAutodarts();
  await expect.poll(() => buttonCorner(page)).toBe("bottom-right");
  const options = await display.options();
  const show = options.page.locator("#show-button");
  const topLeft = options.page.getByRole("radio", {
    name: display.t("cornerTopLeft"),
  });
  await expect(show).toBeChecked();
  await expect(
    options.page.getByRole("radio", { name: display.t("cornerBottomRight") }),
  ).toBeChecked();

  await topLeft.check();
  await options.expectStatus(display.t("saved"));
  await expect.poll(() => buttonCorner(page)).toBe("top-left");

  // A hidden button has no corner to choose.
  await show.uncheck();
  await expect(topLeft).toBeDisabled();
  await expect.poll(() => buttonCorner(page)).toBeNull();
  expect((await display.stored()).pageSettings).toEqual({
    showButton: false,
    corner: "top-left",
  });

  await show.check();
  await expect.poll(() => buttonCorner(page)).toBe("top-left");

  // A page of Autodarts opened later, and the options page opened anew, show the same.
  const later = await display.openAutodarts();
  await expect.poll(() => buttonCorner(later)).toBe("top-left");
  await options.reopen();
  await expect(show).toBeChecked();
  await expect(topLeft).toBeChecked();
});
