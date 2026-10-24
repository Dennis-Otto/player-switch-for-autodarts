/**
 * Who may reach the saved accounts.
 *
 * The accounts hold a session token per player and, where a person asked for it, a
 * password, so only the code of the extension itself may see them: the service worker
 * and its pages, the popup and the switcher that the Autodarts page shows in a frame.
 * The content script runs inside the Autodarts page, in the page's process, and a page
 * whose process is taken over could use it; so it gets neither the storage nor a
 * request that changes the accounts.
 *
 * The service worker imports this file from lib/; nothing here reaches the browser
 * except through what the worker passes in.
 */

/** What a message tells of its sender, as `chrome.runtime.MessageSender` has it. */
export interface Sender {
  /** The id of the extension that sent the message. */
  readonly id?: string | undefined;
  /** The address of the page or frame that sent it. */
  readonly url?: string | undefined;
}

/** Whether the message comes from this extension, from any of its pages or its content script. */
export function fromExtension(sender: Sender, extensionId: string): boolean {
  return extensionId !== "" && sender.id === extensionId;
}

/**
 * Whether the message comes from a page of this extension, such as the popup or the
 * switcher in its frame, and not from the content script, whose address is the one of
 * the Autodarts page. Only those pages may see the accounts and change them.
 */
export function fromExtensionPage(sender: Sender, extensionId: string): boolean {
  if (!fromExtension(sender, extensionId) || typeof sender.url !== "string" || !URL.canParse(sender.url)) {
    return false;
  }
  const url = new URL(sender.url);
  return url.protocol === "chrome-extension:" && url.host === extensionId;
}

/** Who may read and change a storage area of the extension, as `chrome.storage.AccessLevel` has it. */
export type AccessLevel = "TRUSTED_CONTEXTS" | "TRUSTED_AND_UNTRUSTED_CONTEXTS";

/** A storage area whose readers can be limited, as `chrome.storage.StorageArea` has it. */
export interface RestrictableArea {
  setAccessLevel?: ((options: { accessLevel: AccessLevel }) => Promise<void>) | undefined;
}

/**
 * Keeps a storage area from the content scripts: only the service worker and the pages
 * of the extension may read or change it. Chrome lets content scripts read
 * `chrome.storage.local` unless the extension says otherwise, so the service worker
 * says it at each of its starts, and it holds after every restart of the browser.
 * Fails when the browser can't do it, so that the worker leaves a trace.
 */
export async function keepFromContentScripts(area: RestrictableArea): Promise<void> {
  if (typeof area.setAccessLevel !== "function") {
    throw new Error("This browser can't keep the storage from the content scripts.");
  }
  await area.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
}
