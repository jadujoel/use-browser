import type { TestResult } from "../types";
import { serializeError } from "./serialize-error";

export type DoneCallback = (err?: unknown) => void;
export type TestFn =
	| (() => void | Promise<void>)
	| ((done: DoneCallback) => void | Promise<void>);
export type HookFn =
	| (() => void | Promise<void>)
	| ((done: DoneCallback) => void | Promise<void>);

/**
 * Run a test or hook function, supporting both Promise-style and `done`-callback
 * style. We pick the style based on the function's declared arity (matching
 * Bun/Jest/Mocha): if the function takes a parameter, it's done-style.
 *
 * If a done-style fn also returns a Promise, the Promise is observed only for
 * rejections (we still wait for `done()`).
 */
const runStep = (fn: TestFn | HookFn): Promise<void> =>
	new Promise<void>((resolve, reject) => {
		let settled = false;
		const finish = (err?: unknown): void => {
			if (settled) return;
			settled = true;
			if (err === undefined || err === null) {
				resolve();
			} else if (err instanceof Error) {
				reject(err);
			} else {
				reject(new Error(String(err)));
			}
		};

		if (fn.length >= 1) {
			let result: unknown;
			try {
				result = (fn as (done: DoneCallback) => unknown)(finish);
			} catch (err) {
				finish(err);
				return;
			}
			if (result instanceof Promise) {
				// Observe rejections only — done() is the source of truth for completion.
				(result as Promise<unknown>).then(undefined, finish);
			}
			return;
		}

		try {
			const result = (fn as () => unknown)();
			if (result instanceof Promise) {
				(result as Promise<unknown>).then(() => finish(), finish);
			} else {
				finish();
			}
		} catch (err) {
			finish(err);
		}
	});

interface SuiteOptions {
	readonly name: string;
	readonly parent?: Suite;
}

class Suite {
	readonly name: string;
	readonly parent: Suite | undefined;
	readonly beforeAllHooks: HookFn[] = [];
	readonly afterAllHooks: HookFn[] = [];
	readonly beforeEachHooks: HookFn[] = [];
	readonly afterEachHooks: HookFn[] = [];
	readonly children: Array<Suite | Test> = [];

	constructor(options: SuiteOptions) {
		this.name = options.name;
		this.parent = options.parent;
	}
}

interface TestOptions {
	readonly name: string;
	readonly fn: TestFn;
	readonly parent: Suite;
	readonly timeoutMs?: number;
}

class Test {
	readonly name: string;
	readonly fn: TestFn;
	readonly parent: Suite;
	readonly timeoutMs: number | undefined;

	constructor(options: TestOptions) {
		this.name = options.name;
		this.fn = options.fn;
		this.parent = options.parent;
		this.timeoutMs = options.timeoutMs;
	}
}

const isTest = (n: Suite | Test): n is Test => n instanceof Test;

const fullName = (test: Test): string => {
	const parts: string[] = [test.name];
	let suite: Suite | undefined = test.parent;
	while (suite !== undefined && suite.name !== "") {
		parts.unshift(suite.name);
		suite = suite.parent;
	}
	return parts.join(" > ");
};

const DEFAULT_TIMEOUT_MS = 5_000;

const runWithTimeout = async (
	work: Promise<void>,
	timeoutMs: number,
): Promise<void> => {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(
			() => reject(new Error(`timeout after ${timeoutMs}ms`)),
			timeoutMs,
		);
	});
	try {
		await Promise.race([work, timeout]);
	} finally {
		if (timer !== undefined) clearTimeout(timer);
	}
};

const collectHooks = (
	suite: Suite,
	ancestors: readonly Suite[],
	kind: "beforeEach" | "afterEach",
): HookFn[] => {
	const chain: Suite[] = [...ancestors, suite];
	const hooks: HookFn[] = [];
	if (kind === "beforeEach") {
		for (const s of chain) hooks.push(...s.beforeEachHooks);
	} else {
		for (let i = chain.length - 1; i >= 0; i--) {
			const s = chain[i];
			if (s === undefined) continue;
			hooks.push(...s.afterEachHooks);
		}
	}
	return hooks;
};

export class Harness {
	private constructor(
		private readonly root: Suite = new Suite({ name: "" }),
		private current: Suite = root,
	) {}

	static create(): Harness {
		return new Harness();
	}

	startSuite(name: string, fn: () => void): void {
		const suite = new Suite({ name, parent: this.current });
		this.current.children.push(suite);
		const prev = this.current;
		this.current = suite;
		try {
			fn();
		} finally {
			this.current = prev;
		}
	}

	addTest(name: string, fn: TestFn, timeoutMs?: number): void {
		this.current.children.push(
			new Test(
				timeoutMs === undefined
					? { name, fn, parent: this.current }
					: { name, fn, parent: this.current, timeoutMs },
			),
		);
	}

	addBeforeAll(fn: HookFn): void {
		this.current.beforeAllHooks.push(fn);
	}
	addAfterAll(fn: HookFn): void {
		this.current.afterAllHooks.push(fn);
	}
	addBeforeEach(fn: HookFn): void {
		this.current.beforeEachHooks.push(fn);
	}
	addAfterEach(fn: HookFn): void {
		this.current.afterEachHooks.push(fn);
	}

	async run(): Promise<TestResult[]> {
		const results: TestResult[] = [];
		await this.runSuite(this.root, [], results);
		return results;
	}

	private async runSuite(
		suite: Suite,
		ancestors: readonly Suite[],
		results: TestResult[],
	): Promise<void> {
		let beforeAllError: unknown;
		for (const hook of suite.beforeAllHooks) {
			try {
				await runStep(hook);
			} catch (err) {
				beforeAllError = err;
				break;
			}
		}

		for (const child of suite.children) {
			if (isTest(child)) {
				if (beforeAllError !== undefined) {
					results.push({
						name: fullName(child),
						ok: false,
						durationMs: 0,
						error: serializeError(beforeAllError),
					});
					continue;
				}
				const result = await this.runTest(child, ancestors, suite);
				results.push(result);
			} else {
				if (beforeAllError !== undefined) {
					// fail every descendant test of this child suite with the beforeAll error
					this.failAllDescendants(child, beforeAllError, results);
					continue;
				}
				await this.runSuite(child, [...ancestors, suite], results);
			}
		}

		for (const hook of suite.afterAllHooks) {
			try {
				await runStep(hook);
			} catch {
				/* swallowed: afterAll failures don't have an obvious test owner in v1 */
			}
		}
	}

	private async runTest(
		test: Test,
		ancestors: readonly Suite[],
		suite: Suite,
	): Promise<TestResult> {
		const beforeEach = collectHooks(suite, ancestors, "beforeEach");
		const afterEach = collectHooks(suite, ancestors, "afterEach");
		const timeoutMs = test.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		const started = performance.now();

		let error: unknown;
		try {
			for (const hook of beforeEach) await runStep(hook);
			await runWithTimeout(runStep(test.fn), timeoutMs);
		} catch (err) {
			error = err;
		}

		for (const hook of afterEach) {
			try {
				await runStep(hook);
			} catch (err) {
				if (error === undefined) error = err;
			}
		}

		const durationMs = performance.now() - started;
		if (error === undefined) {
			return { name: fullName(test), ok: true, durationMs };
		}
		return {
			name: fullName(test),
			ok: false,
			durationMs,
			error: serializeError(error),
		};
	}

	private failAllDescendants(
		suite: Suite,
		err: unknown,
		results: TestResult[],
	): void {
		for (const child of suite.children) {
			if (isTest(child)) {
				results.push({
					name: fullName(child),
					ok: false,
					durationMs: 0,
					error: serializeError(err),
				});
			} else {
				this.failAllDescendants(child, err, results);
			}
		}
	}
}

export const harness: Harness = Harness.create();
