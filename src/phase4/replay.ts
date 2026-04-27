import type { SerializedError } from "../phase2/types";
import type { TestResultWithMeta } from "./types";

const rehydrate = (s: SerializedError): Error => {
	const e = new Error(s.message);
	e.name = s.name;
	if (s.stack !== undefined) e.stack = s.stack;
	if (s.cause !== undefined) {
		(e as { cause?: unknown }).cause = rehydrate(s.cause);
	}
	return e;
};

/**
 * Convert a failed `TestResultWithMeta` into a real host-side `Error` suitable
 * for `throw`-ing inside a `bun:test` `test(...)` body. Appends the screenshot
 * path (if any) to the message so it surfaces in the standard reporter.
 */
export const resultToError = (result: TestResultWithMeta): Error => {
	const base =
		result.error !== undefined
			? rehydrate(result.error)
			: new Error("test failed without serialized error");
	if (result.screenshotPath !== undefined) {
		base.message = `${base.message}\n  screenshot: ${result.screenshotPath}`;
	}
	return base;
};
