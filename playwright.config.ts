// The configuration of the end-to-end tests lives beside them, in test/e2e/, where
// the types are checked; this file lets `npx playwright test` find it from the root.
export { default } from "./test/e2e/playwright.config.ts";
