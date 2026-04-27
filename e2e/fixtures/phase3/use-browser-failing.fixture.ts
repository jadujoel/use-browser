"use browser";

import { expect, test } from "bun:test";

test("intentional fail", () => {
	expect(1).toBe(2);
});
