// The self-test of scripts/check-manifest.mjs, with fixture manifests that each break
// one rule. scripts/check-project.sh runs it with `node --test` before the check itself.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

import {
  CHROME_MIN,
  checkManifest,
  DESCRIPTION_MAX,
  FIREFOX_ANDROID_MIN,
  FIREFOX_ID,
  FIREFOX_MIN,
  NAME_MAX,
  pngSize,
  WHY,
} from "./check-manifest.mjs";

const POLICY =
  "default-src 'self'; script-src 'self'; object-src 'none'; img-src 'self' https: data:; connect-src https://api.example.com";

/** A manifest that keeps every rule, made anew for each test. */
function manifest() {
  return {
    manifest_version: 3,
    name: "__MSG_extName__",
    description: "__MSG_extDescription__",
    minimum_chrome_version: "140",
    homepage_url: "https://example.org/",
    background: {
      service_worker: "background.js",
      scripts: ["background.js"],
      type: "module",
    },
    browser_specific_settings: {
      gecko: {
        id: FIREFOX_ID,
        strict_min_version: "140.0",
        data_collection_permissions: { required: ["authenticationInfo"] },
      },
      gecko_android: { strict_min_version: "142.0" },
    },
    icons: { 16: "icons/icon-16.png", 48: "icons/icon-48.png" },
    content_scripts: [
      { matches: ["https://play.autodarts.com/*"], js: ["content.js"] },
    ],
    web_accessible_resources: [
      {
        resources: ["switcher.html"],
        matches: ["https://play.autodarts.com/*"],
      },
    ],
    permissions: ["storage", "alarms"],
    host_permissions: [
      "https://play.autodarts.com/*",
      "https://api.example.com/*",
    ],
    content_security_policy: { extension_pages: POLICY },
  };
}

const ALLOWED = {
  permissions: { storage: "the accounts", alarms: "the renewal" },
  host_permissions: {
    "https://play.autodarts.com/*": "the page",
    "https://api.example.com/*": "the sign-in",
  },
  web_accessible_resources: { "switcher.html": "the switcher" },
  data_collection_permissions: { authenticationInfo: "the sign-in" },
};

const LISTING = `# Listing

## Short description (132 characters max)

Switch players with one tap.

## Permission justifications

• storage — the accounts.
• alarms — the renewal.
• switcher.html, for play.autodarts.com only.
• Host access to play.autodarts.com and api.example.com.

## Category
`;

/** The problems of a manifest, with the other inputs as the fixtures have them unless given. */
function check(changes = {}) {
  const locales = changes.locales ?? {
    en: {
      extName: { message: "Player Switch" },
      extDescription: { message: "Switch players." },
    },
  };
  return checkManifest({
    manifest: changes.manifest ?? manifest(),
    allowed: changes.allowed ?? ALLOWED,
    locales,
    // A listing for each language, unless a test gives its own.
    listings:
      changes.listings ??
      Object.fromEntries(
        Object.keys(locales).map((code) => [
          `store/listing.${code}.md`,
          LISTING,
        ]),
      ),
    imageSize:
      changes.imageSize ??
      ((path) => ({
        width: Number(/(\d+)/.exec(path)[1]),
        height: Number(/(\d+)/.exec(path)[1]),
      })),
  });
}

/** Asserts that the check finds exactly one problem, which matches the pattern. */
function findsOne(problems, pattern) {
  assert.equal(problems.length, 1, problems.join("\n"));
  assert.match(problems[0], pattern);
}

test("a manifest that keeps every rule passes", () => {
  assert.deepEqual(check(), []);
});

test("the manifest of the extension passes against the allowlist, its languages and their listings", () => {
  // The same check that the script runs, here so a failing self-test shows it at once.
  const url = (path) => new URL(`../${path}`, import.meta.url);
  const read = (path) => readFileSync(url(path));
  const codes = readdirSync(url("extension/_locales/"));
  assert.ok(codes.includes("en"), "English is the default language");
  const problems = checkManifest({
    manifest: JSON.parse(read("extension/manifest.json")),
    allowed: JSON.parse(read("store/permissions.json")),
    locales: Object.fromEntries(
      codes.map((code) => [
        code,
        JSON.parse(read(`extension/_locales/${code}/messages.json`)),
      ]),
    ),
    listings: Object.fromEntries(
      codes.map((code) => [
        `store/listing.${code}.md`,
        read(`store/listing.${code}.md`).toString(),
      ]),
    ),
    imageSize: (path) => pngSize(read(`extension/${path}`)),
  });
  assert.deepEqual(problems, []);
});

test("a new permission fails until the allowlist and the listings have it", () => {
  const added = manifest();
  added.permissions.push("tabs");
  const problems = check({ manifest: added });
  assert.equal(problems.length, 2, problems.join("\n"));
  assert.match(
    problems[0],
    /asks for the permission tabs, which store\/permissions\.json doesn't allow/,
  );
  assert.match(
    problems[1],
    /store\/listing\.en\.md doesn't justify the permission tabs/,
  );
  // The explanation that the script prints with every failure says what an update with it does.
  assert.match(WHY, /disables an installed extension/);
});

test("a permission that the manifest dropped is dropped from the allowlist and the listing too", () => {
  const dropped = manifest();
  dropped.permissions = ["storage"];
  const problems = check({ manifest: dropped });
  assert.equal(problems.length, 2, problems.join("\n"));
  assert.match(
    problems[0],
    /allows the permission alarms, which extension\/manifest\.json doesn't ask for/,
  );
  assert.match(
    problems[1],
    /justifies the permission alarms, which extension\/manifest\.json doesn't ask for/,
  );
});

test("a new host fails, and a listing that names a host the manifest lacks fails", () => {
  const added = manifest();
  added.host_permissions.push("https://*/*");
  const problems = check({ manifest: added });
  assert.ok(
    problems.some((problem) =>
      /asks for the host https:\/\/\*\/\*/.test(problem),
    ),
    problems.join("\n"),
  );

  for (const everywhere of ["<all_urls>", "*://*/*"]) {
    const wide = manifest();
    wide.host_permissions.push(everywhere);
    const found = check({ manifest: wide });
    const all = found.join("\n");
    assert.ok(
      found.some((problem) =>
        problem.includes(`asks for the host ${everywhere}`),
      ),
      all,
    );
    assert.ok(
      found.some((problem) =>
        problem.includes(`doesn't justify the access to ${everywhere}`),
      ),
      all,
    );
  }

  const stale = LISTING.replace(
    "• alarms",
    "• Host access to play.autodarts.io.\n• alarms",
  );
  findsOne(
    check({ listings: { "store/listing.en.md": stale } }),
    /justifies the access to play\.autodarts\.io/,
  );
  const missing = LISTING.replace(" and api.example.com", "");
  findsOne(
    check({ listings: { "store/listing.en.md": missing } }),
    /doesn't justify the access to api\.example\.com/,
  );
});

test("a new web-accessible page, or one open to another site or extension, fails", () => {
  const added = manifest();
  added.web_accessible_resources[0].resources.push("popup.html");
  const problems = check({ manifest: added });
  assert.equal(problems.length, 2, problems.join("\n"));
  assert.match(problems[0], /asks for the web-accessible page popup\.html/);
  assert.match(problems[1], /doesn't justify the access to popup\.html/);

  const wide = manifest();
  wide.web_accessible_resources[0].matches = ["<all_urls>"];
  findsOne(check({ manifest: wide }), /opens switcher\.html to <all_urls>/);

  const shared = manifest();
  shared.web_accessible_resources[0].extension_ids = ["*"];
  findsOne(check({ manifest: shared }), /to other extensions/);
});

test("a content script on another site or in the world of the page fails", () => {
  const elsewhere = manifest();
  elsewhere.content_scripts[0].matches.push("https://example.org/*");
  findsOne(
    check({ manifest: elsewhere }),
    /runs content\.js on https:\/\/example\.org\/\*/,
  );

  const main = manifest();
  main.content_scripts[0].world = "MAIN";
  findsOne(check({ manifest: main }), /in the world of the page/);
});

test("a key that opens the extension wider fails", () => {
  for (const key of [
    "externally_connectable",
    "optional_permissions",
    "optional_host_permissions",
    "sandbox",
    "update_url",
  ]) {
    const opened = { ...manifest(), [key]: {} };
    findsOne(check({ manifest: opened }), new RegExp(`declares ${key}, which`));
  }
});

test("the content security policy must be there, run only the own scripts and connect only to the hosts", () => {
  const none = manifest();
  delete none.content_security_policy;
  findsOne(
    check({ manifest: none }),
    /has no content_security_policy\.extension_pages/,
  );

  const policy = (text) => {
    const changed = manifest();
    changed.content_security_policy.extension_pages = text;
    return check({ manifest: changed });
  };
  findsOne(
    policy(
      POLICY.replace(
        "script-src 'self'",
        "script-src 'self' https://cdn.example.com",
      ),
    ),
    /script-src 'self'/,
  );
  findsOne(
    policy(POLICY.replace("script-src 'self'; ", "")),
    /must say "script-src 'self'", not "script-src "/,
  );
  findsOne(
    policy(POLICY.replace("default-src 'self'", "default-src *")),
    /must say "default-src 'self'" or "default-src 'none'", not "default-src \*"/,
  );
  findsOne(
    policy(POLICY.replace("object-src 'none'", "object-src 'self'")),
    /object-src 'none'/,
  );
  findsOne(
    policy(`${POLICY} https://example.org`),
    /connect to https:\/\/example\.org, which is no host/,
  );
  findsOne(
    policy(POLICY.replace("; connect-src https://api.example.com", "")),
    /has no connect-src/,
  );
  // Empty parts between the semicolons change nothing.
  assert.deepEqual(policy(`${POLICY};;`), []);
});

test("the minimum version of Chrome and the homepage must be there", () => {
  const old = manifest();
  delete old.minimum_chrome_version;
  findsOne(check({ manifest: old }), /no minimum_chrome_version/);

  const older = manifest();
  older.minimum_chrome_version = String(CHROME_MIN - 1);
  findsOne(check({ manifest: older }), /setAccessLevel work only from 140/);

  const nowhere = manifest();
  nowhere.homepage_url = "http://example.org/";
  findsOne(check({ manifest: nowhere }), /no homepage_url/);
});

test("Firefox runs the same background.js as Chrome and Edge", () => {
  const chromeOnly = manifest();
  delete chromeOnly.background.scripts;
  findsOne(check({ manifest: chromeOnly }), /runs \[\] as background\.scripts/);

  const another = manifest();
  another.background.scripts = ["firefox.js"];
  findsOne(check({ manifest: another }), /runs \["firefox\.js"\] as/);

  const two = manifest();
  two.background.scripts = ["background.js", "more.js"];
  findsOne(check({ manifest: two }), /name the one background\.js in both/);

  const firefoxOnly = manifest();
  delete firefoxOnly.background.service_worker;
  findsOne(
    check({ manifest: firefoxOnly }),
    /nothing as background\.service_worker/,
  );

  const none = manifest();
  delete none.background;
  findsOne(check({ manifest: none }), /runs \[\] as background\.scripts/);
});

test("Firefox keeps the fixed id of the add-on", () => {
  const renamed = manifest();
  renamed.browser_specific_settings.gecko.id = "other@example.org";
  findsOne(check({ manifest: renamed }), /other@example\.org .*another add-on/);

  const missing = manifest();
  delete missing.browser_specific_settings;
  const problems = check({ manifest: missing });
  // Without the settings, the id, both minimum versions and the data are missing.
  assert.equal(problems.length, 4, problems.join("\n"));
  assert.match(problems[0], /no id as browser_specific_settings\.gecko\.id/);
  assert.match(problems[1], /no strict_min_version in [^ ]+\.gecko;/);
  assert.match(problems[2], /no strict_min_version in [^ ]+\.gecko_android;/);
  assert.match(problems[3], /declares no data_collection_permissions/);
});

test("Firefox is asked for the first versions that show the data at the install", () => {
  for (const version of [undefined, "", "139.0", "139.9", "latest", "140.a"]) {
    const old = manifest();
    old.browser_specific_settings.gecko.strict_min_version = version;
    findsOne(
      check({ manifest: old }),
      new RegExp(`settings.gecko;.*only from ${FIREFOX_MIN}.0`),
    );
  }
  for (const version of ["140", "140.0", "141.0.1", "150.0"]) {
    const newer = manifest();
    newer.browser_specific_settings.gecko.strict_min_version = version;
    assert.deepEqual(check({ manifest: newer }), [], version);
  }

  const android = manifest();
  android.browser_specific_settings.gecko_android.strict_min_version = "141.0";
  findsOne(
    check({ manifest: android }),
    new RegExp(`141.0 .*.gecko_android;.*only from ${FIREFOX_ANDROID_MIN}.0`),
  );
  const noAndroid = manifest();
  delete noAndroid.browser_specific_settings.gecko_android;
  findsOne(
    check({ manifest: noAndroid }),
    /no strict_min_version in [^ ]+\.gecko_android;/,
  );
});

test("the data that Firefox shows at the install is exactly the data of the allowlist", () => {
  const more = manifest();
  more.browser_specific_settings.gecko.data_collection_permissions.required.push(
    "browsingActivity",
  );
  findsOne(
    check({ manifest: more }),
    /sends browsingActivity, which data_collection_permissions in store/,
  );

  const none = manifest();
  none.browser_specific_settings.gecko.data_collection_permissions.required = [
    "none",
  ];
  const problems = check({ manifest: none });
  assert.equal(problems.length, 2, problems.join("\n"));
  assert.match(problems[0], /sends no data, which data_collection_permissions/);
  assert.match(problems[1], /sends authenticationInfo, which [^ ]+\.required/);

  for (const declared of [undefined, { required: [] }, {}]) {
    const undeclared = manifest();
    undeclared.browser_specific_settings.gecko.data_collection_permissions =
      declared;
    findsOne(
      check({ manifest: undeclared }),
      /declares no data_collection_permissions\.required/,
    );
  }

  const optional = manifest();
  optional.browser_specific_settings.gecko.data_collection_permissions.optional =
    ["technicalAndInteraction"];
  findsOne(
    check({ manifest: optional }),
    /optional data technicalAndInteraction/,
  );

  // A project that sends nothing allows none, and says so.
  const nothing = manifest();
  nothing.browser_specific_settings.gecko.data_collection_permissions.required =
    ["none"];
  assert.deepEqual(
    check({
      manifest: nothing,
      allowed: { ...ALLOWED, data_collection_permissions: { none: "nothing" } },
    }),
    [],
  );
  const noList = manifest();
  noList.browser_specific_settings.gecko.data_collection_permissions.required =
    [];
  findsOne(
    check({
      manifest: noList,
      allowed: { ...ALLOWED, data_collection_permissions: undefined },
    }),
    /declares no data_collection_permissions\.required/,
  );
});

test("an icon must be a PNG of the size the manifest declares", () => {
  findsOne(
    check({
      imageSize: (path) =>
        path.includes("48")
          ? { width: 48, height: 47 }
          : { width: 16, height: 16 },
    }),
    /declares icons\/icon-48\.png as 48×48 pixels, but it has 48×47/,
  );
  findsOne(
    check({
      imageSize: (path) =>
        path.includes("48") ? null : { width: 16, height: 16 },
    }),
    /names the icon icons\/icon-48\.png, which is no PNG/,
  );
});

test("the name and the description must have a text in every language that fits the store", () => {
  const locales = (name, description) => ({
    en: {
      extName: { message: "Player Switch" },
      extDescription: { message: "Switch players." },
    },
    de: {
      extName: { message: name },
      extDescription: { message: description },
    },
  });
  findsOne(
    check({ locales: locales("x".repeat(NAME_MAX + 1), "kurz") }),
    /name .* has 76 characters in de/,
  );
  findsOne(
    check({ locales: locales("Name", "y".repeat(DESCRIPTION_MAX + 1)) }),
    /description .* has 133 characters in de/,
  );
  findsOne(
    check({ locales: locales("Name", "") }),
    /description of extension\/manifest\.json has no text in de/,
  );
  // A name without a message is taken as it is.
  const plain = { ...manifest(), name: "Player Switch" };
  assert.deepEqual(check({ manifest: plain }), []);
  const missing = { ...manifest(), name: undefined };
  findsOne(
    check({ manifest: missing }),
    /name of extension\/manifest\.json has no text in en/,
  );
});

test("a listing needs a short description that fits the store and a section that justifies the permissions", () => {
  const long = LISTING.replace(
    "Switch players with one tap.",
    "z".repeat(DESCRIPTION_MAX + 1),
  );
  findsOne(
    check({ listings: { "store/listing.en.md": long } }),
    /short description of store\/listing\.en\.md has 133/,
  );
  const empty = LISTING.replace("Switch players with one tap.", "");
  findsOne(
    check({ listings: { "store/listing.en.md": empty } }),
    /has no short description/,
  );
  const none = "# Listing\n\n## Short description\n\nShort.\n";
  findsOne(
    check({ listings: { "store/listing.en.md": none } }),
    /has no section that justifies the permissions/,
  );
  // The section of the justifications may be the last one of the listing.
  const last = LISTING.replace("\n## Category\n", "");
  assert.deepEqual(check({ listings: { "store/listing.en.md": last } }), []);
});

test("each language of the extension has a store listing, and each listing a language", () => {
  const locales = {
    en: {
      extName: { message: "Player Switch" },
      extDescription: { message: "Switch." },
    },
    nl: {
      extName: { message: "Player Switch" },
      extDescription: { message: "Wissel." },
    },
  };
  findsOne(
    check({ locales, listings: { "store/listing.en.md": LISTING } }),
    /The extension speaks nl, but store\/listing\.nl\.md is missing/,
  );
  findsOne(
    check({
      listings: {
        "store/listing.en.md": LISTING,
        "store/listing.fr.md": LISTING,
      },
    }),
    /store\/listing\.fr\.md is the listing of a language that the extension doesn't speak/,
  );
});

test("a listing in Dutch, French or Spanish is read by the headings of its language", () => {
  const headings = {
    nl: ["Korte beschrijving", "Rechtvaardiging van de machtigingen"],
    fr: ["Description courte", "Justification des autorisations"],
    es: ["Descripción breve", "Justificación de los permisos"],
  };
  for (const [code, [short, justified]] of Object.entries(headings)) {
    const listing = LISTING.replace("Short description", short).replace(
      "Permission justifications",
      justified,
    );
    const file = `store/listing.${code}.md`;
    const locales = {
      en: {
        extName: { message: "Player Switch" },
        extDescription: { message: "Switch." },
      },
      [code]: {
        extName: { message: "Player Switch" },
        extDescription: { message: "Switch." },
      },
    };
    assert.deepEqual(
      check({
        locales,
        listings: { "store/listing.en.md": LISTING, [file]: listing },
      }),
      [],
    );
    findsOne(
      check({
        locales,
        listings: {
          "store/listing.en.md": LISTING,
          [file]: listing.replace("• alarms — the renewal.\n", ""),
        },
      }),
      new RegExp(
        `listing\\.${code}\\.md doesn't justify the permission alarms`,
      ),
    );
  }
});

test("pngSize reads the size from the header of a PNG and nothing else", () => {
  const header = Buffer.alloc(24);
  Buffer.from("89504e470d0a1a0a", "hex").copy(header);
  header.writeUInt32BE(128, 16);
  header.writeUInt32BE(64, 20);
  assert.deepEqual(pngSize(header), { width: 128, height: 64 });
  assert.equal(pngSize(null), null);
  assert.equal(pngSize(Buffer.from("not a picture at all, not at all")), null);
  assert.equal(pngSize(header.subarray(0, 20)), null);
});
