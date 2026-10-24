// Guards the manifest of the extension, extension/manifest.json, against a permission,
// a host or an opening that nobody meant to add, and against what the Chrome Web Store
// refuses. It checks that:
//
// - the permissions, the hosts and the web-accessible pages are exactly those that
//   store/permissions.json allows, each with its reason, and that both store listings
//   justify each of them and nothing else;
// - nothing opens the extension wider: no externally_connectable, no optional or
//   sandboxed extras, no content script in the world of the page, and a content
//   security policy that runs only the extension's own scripts and connects only to the
//   hosts of the manifest;
// - the manifest names a minimum version of Chrome and a homepage, its icons have the
//   sizes it declares, and the name and description in every language, and the short
//   descriptions of the listings, fit the limits of the store.
//
// Run by scripts/check-project.sh; scripts/check-manifest.test.mjs tests it. No dependencies.
import { existsSync, readdirSync, readFileSync } from "node:fs";

/**
 * The oldest Chrome that the extension may name: the first one in which
 * chrome.storage.local.setAccessLevel works, which keeps the accounts from the content script.
 */
export const CHROME_MIN = 140;

/** The limits of the Chrome Web Store for the name and the short description. */
export const NAME_MAX = 75;
export const DESCRIPTION_MAX = 132;

/** What happens when a permission comes in with an update, said with every finding of it. */
export const WHY =
  "Chrome disables an installed extension after an update that asks for a new permission or host, until someone " +
  "accepts the new warning in chrome://extensions, and a board display in kiosk mode then stops switching without " +
  "a word. So store/permissions.json allows each permission, host and web-accessible page with its reason, and " +
  "both store listings justify it.";

/** Keys that open the extension wider than it needs, and why each is left out. */
const FORBIDDEN = {
  externally_connectable: "lets web pages and other extensions send requests to the service worker",
  optional_permissions: "grants permissions at run time that store/permissions.json doesn't list",
  optional_host_permissions: "grants hosts at run time that store/permissions.json doesn't list",
  sandbox: "serves pages under a looser content security policy",
  update_url: "takes the updates from somewhere other than the Chrome Web Store",
};

/** The directives of a content security policy, each with its sources. */
function directives(policy) {
  const parsed = new Map();
  for (const part of policy.split(";")) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name !== undefined && name !== "") {
      parsed.set(name.toLowerCase(), sources);
    }
  }
  return parsed;
}

/** The origin that a host permission such as https://api.autodarts.com/* grants. */
const originOf = (pattern) => pattern.replace(/\/\*$/, "");

/** The host that a host permission grants, or the pattern itself when it names no single host, such as <all_urls>. */
function hostOf(pattern) {
  const origin = originOf(pattern);
  return URL.canParse(origin) ? new URL(origin).host : pattern;
}

/** The text of a section of a listing, from its heading to the next one. */
function section(text, heading) {
  const start = text.search(heading);
  if (start === -1) {
    return null;
  }
  const rest = text.slice(start).replace(/^.*\n/, "");
  const end = rest.search(/^## /m);
  return end === -1 ? rest : rest.slice(0, end);
}

/** Compares what the manifest asks for with what the allowlist allows. */
function compare(problems, what, asked, allowed) {
  for (const entry of asked) {
    if (!(entry in allowed)) {
      problems.push(
        `extension/manifest.json asks for the ${what} ${entry}, which store/permissions.json doesn't allow. ` +
          "Remove it, or add it there with its reason and justify it in both store listings.",
      );
    }
  }
  for (const entry of Object.keys(allowed)) {
    if (!asked.includes(entry)) {
      problems.push(
        `store/permissions.json allows the ${what} ${entry}, which extension/manifest.json doesn't ask for. ` +
          "Remove it there and from both store listings.",
      );
    }
  }
}

/** The permissions, hosts and pages; the names in the problems say which list each one is in. */
function checkAccess(problems, manifest, allowed) {
  const hosts = manifest.host_permissions ?? [];
  compare(problems, "permission", manifest.permissions ?? [], allowed.permissions);
  compare(problems, "host", hosts, allowed.host_permissions);
  const pages = manifest.web_accessible_resources ?? [];
  compare(
    problems,
    "web-accessible page",
    pages.flatMap((entry) => entry.resources ?? []),
    allowed.web_accessible_resources,
  );
  for (const entry of pages) {
    for (const match of entry.matches ?? []) {
      if (!hosts.includes(match)) {
        problems.push(
          `extension/manifest.json opens ${entry.resources} to ${match}, a site it has no access to; open it only to the Autodarts page.`,
        );
      }
    }
    if (entry.extension_ids !== undefined) {
      problems.push("extension/manifest.json opens a web-accessible page to other extensions; remove extension_ids.");
    }
  }
  for (const script of manifest.content_scripts ?? []) {
    for (const match of script.matches ?? []) {
      if (!hosts.includes(match)) {
        problems.push(
          `extension/manifest.json runs content.js on ${match}, a site it has no access to; add the host or remove the match.`,
        );
      }
    }
    if (script.world === "MAIN") {
      problems.push(
        "extension/manifest.json runs a content script in the world of the page, where the scripts of the page reach it; remove world.",
      );
    }
  }
  for (const [key, reason] of Object.entries(FORBIDDEN)) {
    if (key in manifest) {
      problems.push(`extension/manifest.json declares ${key}, which ${reason}; remove it.`);
    }
  }
}

/** The content security policy of the pages and the service worker of the extension. */
function checkPolicy(problems, manifest) {
  const policy = manifest.content_security_policy?.extension_pages;
  if (typeof policy !== "string") {
    problems.push(
      "extension/manifest.json has no content_security_policy.extension_pages; without one, the pages and the service " +
        "worker may load images and send requests anywhere.",
    );
    return;
  }
  const parsed = directives(policy);
  const only = (name, allowed) => {
    const sources = parsed.get(name);
    if (sources === undefined || sources.length === 0 || sources.some((source) => !allowed.includes(source))) {
      problems.push(
        `The content security policy of extension/manifest.json must say ${allowed.map((source) => `"${name} ${source}"`).join(" or ")}, not "${name} ${sources?.join(" ") ?? ""}".`,
      );
    }
  };
  only("default-src", ["'self'", "'none'"]);
  only("script-src", ["'self'"]);
  only("object-src", ["'none'"]);
  const origins = (manifest.host_permissions ?? []).map(originOf);
  const connect = parsed.get("connect-src") ?? [];
  if (connect.length === 0) {
    problems.push(
      "The content security policy of extension/manifest.json has no connect-src, so the service worker may send requests " +
        "anywhere; name the hosts of the manifest that it talks to.",
    );
  }
  for (const source of connect) {
    if (!origins.includes(source)) {
      problems.push(
        `The content security policy of extension/manifest.json lets the extension connect to ${source}, which is no host of the manifest.`,
      );
    }
  }
}

/** The text of a message of the manifest, such as __MSG_extName__, in one language. */
function resolve(value, messages) {
  const key = /^__MSG_(\w+)__$/.exec(value ?? "")?.[1];
  return key === undefined ? value : messages[key]?.message;
}

/** The minimum version, the homepage, the icons and what the store shows of the manifest. */
function checkDetails(problems, manifest, locales, imageSize) {
  if (!/^\d+$/.test(manifest.minimum_chrome_version ?? "")) {
    problems.push(
      "extension/manifest.json names no minimum_chrome_version; an older Chrome installs the extension and then fails as " +
        "it runs. docs/development.md says which version the code needs.",
    );
  } else if (Number(manifest.minimum_chrome_version) < CHROME_MIN) {
    problems.push(
      `extension/manifest.json names minimum_chrome_version ${manifest.minimum_chrome_version}, but Chrome makes ` +
        `chrome.storage.local.setAccessLevel work only from ${CHROME_MIN}; an older Chrome lets the script in the ` +
        `Autodarts page read every saved account. Name ${CHROME_MIN} or newer.`,
    );
  }
  if (!/^https:\/\//.test(manifest.homepage_url ?? "")) {
    problems.push("extension/manifest.json has no homepage_url that starts with https://; chrome://extensions links it.");
  }
  for (const [size, path] of Object.entries(manifest.icons ?? {})) {
    const actual = imageSize(path);
    if (actual === null) {
      problems.push(`extension/manifest.json names the icon ${path}, which is no PNG in extension/.`);
    } else if (actual.width !== Number(size) || actual.height !== Number(size)) {
      problems.push(
        `extension/manifest.json declares ${path} as ${size}×${size} pixels, but it has ${actual.width}×${actual.height}.`,
      );
    }
  }
  for (const [language, messages] of Object.entries(locales)) {
    for (const [field, max] of [
      ["name", NAME_MAX],
      ["description", DESCRIPTION_MAX],
    ]) {
      const text = resolve(manifest[field], messages);
      if (typeof text !== "string" || text === "") {
        problems.push(`The ${field} of extension/manifest.json has no text in ${language}.`);
      } else if (text.length > max) {
        problems.push(
          `The ${field} of extension/manifest.json has ${text.length} characters in ${language}; the store takes ${max} at most.`,
        );
      }
    }
  }
}

/** The headings of the sections of a listing that the checks read, in English and German. */
const SHORT_DESCRIPTION = /^## (?:Short description|Kurzbeschreibung)/m;
const JUSTIFICATIONS = /^## (?:Permission justifications|Begründung der Berechtigungen)/m;

/** The store listings: their short descriptions, and that they justify exactly what the manifest asks for. */
function checkListings(problems, manifest, listings) {
  const permissions = manifest.permissions ?? [];
  const hosts = (manifest.host_permissions ?? []).map(hostOf);
  const pages = (manifest.web_accessible_resources ?? []).flatMap((entry) => entry.resources ?? []);
  for (const [file, text] of Object.entries(listings)) {
    const short = section(text, SHORT_DESCRIPTION)?.trim();
    if (short === undefined || short === "") {
      problems.push(`${file} has no short description.`);
    } else if (short.length > DESCRIPTION_MAX) {
      problems.push(
        `The short description of ${file} has ${short.length} characters; the store takes ${DESCRIPTION_MAX} at most.`,
      );
    }
    const justified = section(text, JUSTIFICATIONS);
    if (justified === null) {
      problems.push(`${file} has no section that justifies the permissions.`);
      continue;
    }
    const named = [...justified.matchAll(/^• ([a-z][A-Za-z]*) —/gm)].map((match) => match[1]);
    for (const permission of permissions) {
      if (!named.includes(permission)) {
        problems.push(`${file} doesn't justify the permission ${permission}; add a line "• ${permission} — why".`);
      }
    }
    for (const name of named) {
      if (!permissions.includes(name)) {
        problems.push(`${file} justifies the permission ${name}, which extension/manifest.json doesn't ask for; remove it.`);
      }
    }
    for (const needed of [...hosts, ...pages]) {
      if (!justified.includes(needed)) {
        problems.push(`${file} doesn't justify the access to ${needed}; name it in the justification.`);
      }
    }
    for (const host of new Set(justified.match(/\b(?:[a-z0-9-]+\.)*autodarts\.[a-z]+\b/g))) {
      if (!hosts.includes(host)) {
        problems.push(`${file} justifies the access to ${host}, which extension/manifest.json doesn't ask for; remove it.`);
      }
    }
  }
}

/**
 * The problems of a manifest; none when it asks for exactly what the allowlist allows
 * and fits the store.
 *
 * @param {object} input
 * @param {Record<string, any>} input.manifest the parsed extension/manifest.json
 * @param {{permissions: Record<string, string>, host_permissions: Record<string, string>, web_accessible_resources: Record<string, string>}} input.allowed
 *   the parsed store/permissions.json
 * @param {Record<string, Record<string, {message: string}>>} input.locales the messages of each language, by its code
 * @param {Record<string, string>} input.listings the text of each store listing, by its path
 * @param {(path: string) => {width: number, height: number} | null} input.imageSize the size of a PNG of extension/
 * @returns {string[]}
 */
export function checkManifest({ manifest, allowed, locales, listings, imageSize }) {
  const problems = [];
  checkAccess(problems, manifest, allowed);
  checkPolicy(problems, manifest);
  checkDetails(problems, manifest, locales, imageSize);
  checkListings(problems, manifest, listings);
  return problems;
}

/** The width and height of a PNG, from its header; null for a file that is missing or no PNG. */
export function pngSize(bytes) {
  const signature = "89504e470d0a1a0a";
  if (bytes === null || bytes.length < 24 || Buffer.from(bytes.subarray(0, 8)).toString("hex") !== signature) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function main() {
  const root = new URL("../", import.meta.url);
  const read = (path) => readFileSync(new URL(path, root), "utf8");
  const json = (path) => JSON.parse(read(path));
  const manifest = json("extension/manifest.json");
  const locales = Object.fromEntries(
    readdirSync(new URL("extension/_locales/", root)).map((code) => [
      code,
      json(`extension/_locales/${code}/messages.json`),
    ]),
  );
  const listings = Object.fromEntries(
    readdirSync(new URL("store/", root))
      .filter((name) => /^listing\.[a-z]+\.md$/.test(name))
      .map((name) => [`store/${name}`, read(`store/${name}`)]),
  );
  const imageSize = (path) => {
    const file = new URL(`extension/${path}`, root);
    return pngSize(existsSync(file) ? readFileSync(file) : null);
  };
  const problems = checkManifest({ manifest, allowed: json("store/permissions.json"), locales, listings, imageSize });
  if (problems.length > 0) {
    for (const problem of problems) {
      console.error(problem);
    }
    console.error(`Why it matters: ${WHY}`);
    process.exit(1);
  }
  console.log(
    `The manifest asks for the ${manifest.permissions.length} permissions and ${manifest.host_permissions.length} hosts ` +
      `that store/permissions.json allows, both listings justify them, and its policy connects only to those hosts.`,
  );
}

// Run as a script, not imported by its test.
if (import.meta.main) {
  main();
}
