// No "use browser" directive — this file should pass through the preload
// untouched and run on the host process where `document` is undefined.

import { expect, test } from "bun:test";

test("runs in host", () => {
  expect(typeof globalThis.document).toBe("undefined");
});
