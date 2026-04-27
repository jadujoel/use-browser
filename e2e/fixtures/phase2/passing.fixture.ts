import { describe, expect, test } from "bun:test";

test("addition", () => {
	expect(1 + 1).toBe(2);
});

test("array equality", () => {
	expect([1, 2, 3]).toEqual([1, 2, 3]);
});

test("DOM is real", () => {
	document.body.innerHTML = "<p>hi</p>";
	expect(document.querySelector("p")?.textContent).toBe("hi");
});

describe("nested suite", () => {
	test("string contains", () => {
		expect("hello world").toContain("world");
	});

	test("not.toBe negation", () => {
		expect(1).not.toBe(2);
	});
});
