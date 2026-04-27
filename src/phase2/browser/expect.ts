import { deepEqual } from "./deep-equal";

export class AssertionError extends Error {
	override readonly name = "AssertionError";
	readonly matcherName: string;
	readonly actual: unknown;
	readonly expected: unknown;

	constructor(
		message: string,
		matcherName: string,
		actual: unknown,
		expected: unknown,
	) {
		super(message);
		this.matcherName = matcherName;
		this.actual = actual;
		this.expected = expected;
	}
}

const stringify = (v: unknown): string => {
	if (typeof v === "function") return `[Function ${v.name || "anonymous"}]`;
	if (typeof v === "symbol") return v.toString();
	if (typeof v === "bigint") return `${v.toString()}n`;
	if (typeof v === "string") return JSON.stringify(v);
	try {
		const seen = new WeakSet();
		return (
			JSON.stringify(v, (_k, val) => {
				if (typeof val === "object" && val !== null) {
					if (seen.has(val as object)) return "[Circular]";
					seen.add(val as object);
				}
				if (typeof val === "bigint") return `${val.toString()}n`;
				return val as unknown;
			}) ?? String(v)
		);
	} catch {
		return String(v);
	}
};

interface CoreMatchers {
	toBe(expected: unknown): void;
	toEqual(expected: unknown): void;
	toBeUndefined(): void;
	toBeDefined(): void;
	toBeNull(): void;
	toBeNaN(): void;
	toBeTruthy(): void;
	toBeFalsy(): void;
	toBeInstanceOf(ctor: new (...args: never) => unknown): void;
	toContain(item: unknown): void;
	toHaveLength(n: number): void;
	toThrow(matcher?: unknown): void;
	toBeGreaterThan(n: number | bigint): void;
	toBeGreaterThanOrEqual(n: number | bigint): void;
	toBeLessThan(n: number | bigint): void;
	toBeLessThanOrEqual(n: number | bigint): void;
	toMatch(pattern: RegExp | string): void;
}

export interface Matchers extends CoreMatchers {
	readonly not: CoreMatchers;
}

const fail = (
	matcherName: string,
	actual: unknown,
	expected: unknown,
	message: string,
): never => {
	throw new AssertionError(message, matcherName, actual, expected);
};

const check = (
	passed: boolean,
	negated: boolean,
	matcherName: string,
	actual: unknown,
	expected: unknown,
	describePass: () => string,
): void => {
	const ok = negated ? !passed : passed;
	if (ok) return;
	fail(matcherName, actual, expected, describePass());
};

const matchersFor = (actual: unknown, negated: boolean): Matchers => {
	const not = negated ? "not " : "";
	const fmt = stringify;

	const base: CoreMatchers = {
		toBe: (expected) => {
			check(
				Object.is(actual, expected),
				negated,
				"toBe",
				actual,
				expected,
				() => `expected ${fmt(actual)} ${not}to be ${fmt(expected)}`,
			);
		},
		toEqual: (expected) => {
			check(
				deepEqual(actual, expected),
				negated,
				"toEqual",
				actual,
				expected,
				() => `expected ${fmt(actual)} ${not}to equal ${fmt(expected)}`,
			);
		},
		toBeUndefined: () => {
			check(
				actual === undefined,
				negated,
				"toBeUndefined",
				actual,
				undefined,
				() => `expected ${fmt(actual)} ${not}to be undefined`,
			);
		},
		toBeDefined: () => {
			check(
				actual !== undefined,
				negated,
				"toBeDefined",
				actual,
				"<defined>",
				() => `expected ${fmt(actual)} ${not}to be defined`,
			);
		},
		toBeNull: () => {
			check(
				actual === null,
				negated,
				"toBeNull",
				actual,
				null,
				() => `expected ${fmt(actual)} ${not}to be null`,
			);
		},
		toBeNaN: () => {
			check(
				typeof actual === "number" && Number.isNaN(actual),
				negated,
				"toBeNaN",
				actual,
				NaN,
				() => `expected ${fmt(actual)} ${not}to be NaN`,
			);
		},
		toBeTruthy: () => {
			check(
				Boolean(actual),
				negated,
				"toBeTruthy",
				actual,
				"<truthy>",
				() => `expected ${fmt(actual)} ${not}to be truthy`,
			);
		},
		toBeFalsy: () => {
			check(
				!actual,
				negated,
				"toBeFalsy",
				actual,
				"<falsy>",
				() => `expected ${fmt(actual)} ${not}to be falsy`,
			);
		},
		toBeInstanceOf: (ctor) => {
			const passed =
				typeof ctor === "function" &&
				actual instanceof (ctor as new (...args: unknown[]) => unknown);
			check(
				passed,
				negated,
				"toBeInstanceOf",
				actual,
				(ctor as { name?: string }).name ?? "<ctor>",
				() =>
					`expected ${fmt(actual)} ${not}to be instance of ${(ctor as { name?: string }).name ?? "<ctor>"}`,
			);
		},
		toContain: (item) => {
			let passed = false;
			if (typeof actual === "string") passed = actual.includes(String(item));
			else if (Array.isArray(actual))
				passed = actual.some((a) => Object.is(a, item));
			else if (actual instanceof Set) passed = actual.has(item);
			else if (
				actual !== null &&
				actual !== undefined &&
				Symbol.iterator in (actual as object)
			) {
				for (const v of actual as Iterable<unknown>) {
					if (Object.is(v, item)) {
						passed = true;
						break;
					}
				}
			}
			check(
				passed,
				negated,
				"toContain",
				actual,
				item,
				() => `expected ${fmt(actual)} ${not}to contain ${fmt(item)}`,
			);
		},
		toHaveLength: (n) => {
			const len = (actual as { length?: unknown } | null | undefined)?.length;
			check(
				len === n,
				negated,
				"toHaveLength",
				len,
				n,
				() => `expected length ${fmt(len)} ${not}to be ${fmt(n)}`,
			);
		},
		toThrow: (matcher) => {
			if (typeof actual !== "function") {
				fail(
					"toThrow",
					actual,
					matcher,
					`expected a function, got ${fmt(actual)}`,
				);
			}
			let thrown: unknown;
			let didThrow = false;
			try {
				(actual as () => unknown)();
			} catch (err) {
				didThrow = true;
				thrown = err;
			}
			if (negated) {
				if (didThrow) {
					fail(
						"toThrow",
						thrown,
						matcher,
						`expected function not to throw, but it threw ${fmt(thrown)}`,
					);
				}
				return;
			}
			if (!didThrow) {
				fail("toThrow", undefined, matcher, "expected function to throw");
			}
			if (matcher === undefined) return;
			const errMessage =
				thrown instanceof Error ? thrown.message : String(thrown);
			if (typeof matcher === "string") {
				if (!errMessage.includes(matcher)) {
					fail(
						"toThrow",
						errMessage,
						matcher,
						`expected error message to contain ${fmt(matcher)}, got ${fmt(errMessage)}`,
					);
				}
			} else if (matcher instanceof RegExp) {
				if (!matcher.test(errMessage)) {
					fail(
						"toThrow",
						errMessage,
						matcher,
						`expected error message to match ${matcher}, got ${fmt(errMessage)}`,
					);
				}
			} else if (typeof matcher === "function") {
				if (
					!(thrown instanceof (matcher as new (...args: unknown[]) => unknown))
				) {
					const ctorName = (matcher as { name?: string }).name ?? "<ctor>";
					fail(
						"toThrow",
						thrown,
						matcher,
						`expected error to be instance of ${ctorName}, got ${fmt(thrown)}`,
					);
				}
			}
		},
		toBeGreaterThan: (n) => {
			check(
				(actual as number | bigint) > n,
				negated,
				"toBeGreaterThan",
				actual,
				n,
				() => `expected ${fmt(actual)} ${not}to be greater than ${fmt(n)}`,
			);
		},
		toBeGreaterThanOrEqual: (n) => {
			check(
				(actual as number | bigint) >= n,
				negated,
				"toBeGreaterThanOrEqual",
				actual,
				n,
				() => `expected ${fmt(actual)} ${not}to be >= ${fmt(n)}`,
			);
		},
		toBeLessThan: (n) => {
			check(
				(actual as number | bigint) < n,
				negated,
				"toBeLessThan",
				actual,
				n,
				() => `expected ${fmt(actual)} ${not}to be less than ${fmt(n)}`,
			);
		},
		toBeLessThanOrEqual: (n) => {
			check(
				(actual as number | bigint) <= n,
				negated,
				"toBeLessThanOrEqual",
				actual,
				n,
				() => `expected ${fmt(actual)} ${not}to be <= ${fmt(n)}`,
			);
		},
		toMatch: (pattern) => {
			const str = String(actual);
			const passed =
				pattern instanceof RegExp ? pattern.test(str) : str.includes(pattern);
			check(
				passed,
				negated,
				"toMatch",
				actual,
				pattern,
				() =>
					`expected ${fmt(actual)} ${not}to match ${pattern instanceof RegExp ? pattern.toString() : fmt(pattern)}`,
			);
		},
	};

	return {
		...base,
		get not(): CoreMatchers {
			return matchersFor(actual, !negated);
		},
	};
};

export const expect = (actual: unknown): Matchers => matchersFor(actual, false);
