import { type HookFn, harness, type TestFn } from "./harness";

export { mock } from "../../phase5/browser/mock";
export { expect } from "./expect";

export const test = (name: string, fn: TestFn, timeoutMs?: number): void => {
	harness.addTest(name, fn, timeoutMs);
};

export const it = test;

export const describe = (name: string, fn: () => void): void => {
	harness.startSuite(name, fn);
};

export const beforeAll = (fn: HookFn): void => {
	harness.addBeforeAll(fn);
};

export const afterAll = (fn: HookFn): void => {
	harness.addAfterAll(fn);
};

export const beforeEach = (fn: HookFn): void => {
	harness.addBeforeEach(fn);
};

export const afterEach = (fn: HookFn): void => {
	harness.addAfterEach(fn);
};
