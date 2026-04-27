"use browser";

import { expect, test } from "bun:test";

console.log("BTR_FORWARD_TOP_LEVEL:hello-from-browser");

test("forwards console.log from inside a test", () => {
	console.log("BTR_FORWARD_IN_TEST:value=", 42);
	console.warn("BTR_FORWARD_WARN:warning-line");
	expect(1 + 1).toBe(2);
});
