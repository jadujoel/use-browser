/**
 * Minimal `vi.fn()` / `jest.fn()` equivalent for use inside browser tests.
 * Tracks calls and results; supports re-implementing on the fly. Returned
 * by the `mock(...)` re-export from the `bun:test` shim.
 */

export interface MockResult {
	readonly type: "return" | "throw";
	readonly value: unknown;
}

export interface MockState<Args extends readonly unknown[]> {
	readonly calls: ReadonlyArray<Args>;
	readonly results: ReadonlyArray<MockResult>;
}

export interface Mock<Args extends readonly unknown[], R> {
	(...args: Args): R;
	readonly mock: MockState<Args>;
	mockClear(): Mock<Args, R>;
	mockReset(): Mock<Args, R>;
	mockImplementation(impl: (...args: Args) => R): Mock<Args, R>;
	mockReturnValue(value: R): Mock<Args, R>;
	mockResolvedValue(value: Awaited<R>): Mock<Args, R>;
	mockRejectedValue(reason: unknown): Mock<Args, R>;
}

const noop = <Args extends readonly unknown[], R>(): ((...args: Args) => R) =>
	(() => undefined) as unknown as (...args: Args) => R;

export const mock = <Args extends readonly unknown[] = unknown[], R = unknown>(
	impl?: (...args: Args) => R,
): Mock<Args, R> => {
	let current: (...args: Args) => R = impl ?? noop<Args, R>();
	const calls: Args[] = [];
	const results: MockResult[] = [];

	const fn = ((...args: Args): R => {
		calls.push(args);
		try {
			const value = current(...args);
			results.push({ type: "return", value });
			return value;
		} catch (err) {
			results.push({ type: "throw", value: err });
			throw err;
		}
	}) as Mock<Args, R>;

	Object.defineProperty(fn, "mock", {
		get: (): MockState<Args> => ({ calls, results }),
		enumerable: true,
	});

	fn.mockClear = (): Mock<Args, R> => {
		calls.length = 0;
		results.length = 0;
		return fn;
	};
	fn.mockReset = (): Mock<Args, R> => {
		fn.mockClear();
		current = noop<Args, R>();
		return fn;
	};
	fn.mockImplementation = (i: (...args: Args) => R): Mock<Args, R> => {
		current = i;
		return fn;
	};
	fn.mockReturnValue = (v: R): Mock<Args, R> => {
		current = (() => v) as (...args: Args) => R;
		return fn;
	};
	fn.mockResolvedValue = (v: Awaited<R>): Mock<Args, R> => {
		current = (() => Promise.resolve(v) as unknown as R) as (
			...args: Args
		) => R;
		return fn;
	};
	fn.mockRejectedValue = (reason: unknown): Mock<Args, R> => {
		current = (() => Promise.reject(reason) as unknown as R) as (
			...args: Args
		) => R;
		return fn;
	};
	return fn;
};
