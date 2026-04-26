import { expect, test } from "bun:test";

test("toEqual diff is captured", () => {
  expect({ a: 1, b: 2 }).toEqual({ a: 1, b: 3 });
});

test("error with cause", () => {
  throw new Error("outer", { cause: new Error("inner reason") });
});

test("toThrow expectation works", () => {
  expect(() => {
    throw new Error("boom");
  }).toThrow("boom");
});
