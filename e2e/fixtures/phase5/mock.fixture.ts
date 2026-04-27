"use browser";

import { expect, mock, test } from "bun:test";

test("mock tracks calls and return values", () => {
	const fn = mock((x: number) => x * 2);
	fn(2);
	fn(5);
	expect(fn.mock.calls.length).toBe(2);
	expect(fn.mock.calls[0]).toEqual([2]);
	expect(fn.mock.calls[1]).toEqual([5]);
	expect(fn.mock.results[0]).toEqual({ type: "return", value: 4 });
	expect(fn.mock.results[1]).toEqual({ type: "return", value: 10 });
});

test("mock.mockReturnValue overrides the implementation", () => {
	const fn = mock((x: number) => x);
	fn.mockReturnValue(42);
	expect(fn(1)).toBe(42);
	expect(fn(2)).toBe(42);
});

test("mock.mockClear empties the call history", () => {
	const fn = mock((x: number) => x);
	fn(1);
	fn(2);
	fn.mockClear();
	expect(fn.mock.calls.length).toBe(0);
	expect(fn.mock.results.length).toBe(0);
	fn(3);
	expect(fn.mock.calls.length).toBe(1);
});

test("mock records thrown errors as 'throw' results", () => {
	const fn = mock(() => {
		throw new Error("nope");
	});
	expect(() => fn()).toThrow("nope");
	expect(fn.mock.results[0]?.type).toBe("throw");
});
