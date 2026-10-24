import assert from "node:assert/strict";
import { test } from "node:test";

import {
  browserName,
  REPOSITORY,
  reportUrl,
  welcomes,
} from "../src/onboarding.ts";

test("the welcome page opens after the install, and not after an update", () => {
  assert.equal(welcomes("install"), true);
  assert.equal(welcomes("update"), false);
  assert.equal(welcomes("chrome_update"), false);
  assert.equal(welcomes("shared_module_update"), false);
});

test("the browser names its own brand before that of Chromium", () => {
  const chrome = [
    { brand: "Not)A;Brand", version: "99" },
    { brand: "Google Chrome", version: "130" },
    { brand: "Chromium", version: "130" },
  ];
  assert.equal(browserName(chrome, ""), "Google Chrome 130");
  const edge = [
    { brand: "Chromium", version: "129" },
    { brand: "Microsoft Edge", version: "129" },
    { brand: "Not=A?Brand", version: "8" },
  ];
  assert.equal(browserName(edge, ""), "Microsoft Edge 129");
});

test("a browser that names only Chromium is Chromium", () => {
  assert.equal(
    browserName(
      [
        { brand: "Chromium", version: "128" },
        { brand: "Not_A Brand", version: "24" },
      ],
      "",
    ),
    "Chromium 128",
  );
});

test("without brands, the browser is the Chrome of its user agent", () => {
  const agent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
  assert.equal(browserName(undefined, agent), "Chrome 130");
  assert.equal(
    browserName([{ brand: "Not A(Brand", version: "99" }], agent),
    "Chrome 130",
  );
  assert.equal(browserName([], "Something else"), "unknown");
});

test("the bug report carries the versions of the extension and the browser, and nothing else", () => {
  const url = new URL(reportUrl("0.3.0", "Google Chrome 130"));
  assert.equal(`${url.origin}${url.pathname}`, `${REPOSITORY}/issues/new`);
  assert.deepEqual(
    [...url.searchParams],
    [
      ["template", "bug_report.yml"],
      ["version", "0.3.0"],
      ["browser", "Google Chrome 130"],
    ],
  );
});
