// No "use browser" directive — this file runs on the host bun:test process.
// Mix browser-only and host-only files in the same suite freely.

import { expect, test } from "bun:test";

test("runs in Bun (no DOM)", () => {
  expect(typeof globalThis.document).toBe("undefined");
  expect(typeof Bun).toBe("object");
});
