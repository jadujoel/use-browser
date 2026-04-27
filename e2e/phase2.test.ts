import { describe, expect, test } from "bun:test";
import { runUserFile } from "../src/phase2/runner";

const TEST_TIMEOUT_MS = 30_000;

const fixturePath = (name: string): string =>
	new URL(`./fixtures/phase2/${name}`, import.meta.url).pathname;

describe("phase 2 — bundling pipeline", () => {
	test(
		"passing.fixture: shim wires test/describe/expect end-to-end",
		async () => {
			const { results, sentinelResults } = await runUserFile({
				userFile: fixturePath("passing.fixture.ts"),
			});

			expect(results).toHaveLength(5);
			const byName = new Map(results.map((r) => [r.name, r]));
			expect(byName.get("addition")?.ok).toBe(true);
			expect(byName.get("array equality")?.ok).toBe(true);
			expect(byName.get("DOM is real")?.ok).toBe(true);
			expect(byName.get("nested suite > string contains")?.ok).toBe(true);
			expect(byName.get("nested suite > not.toBe negation")?.ok).toBe(true);

			// Sentinel channel mirrors the evaluate() channel.
			expect(sentinelResults).toHaveLength(results.length);
		},
		TEST_TIMEOUT_MS,
	);

	test(
		"failing.fixture: AssertionError diff fields and Error cause both round-trip",
		async () => {
			const { results } = await runUserFile({
				userFile: fixturePath("failing.fixture.ts"),
			});

			expect(results).toHaveLength(3);
			const byName = new Map(results.map((r) => [r.name, r]));

			const diff = byName.get("toEqual diff is captured");
			expect(diff?.ok).toBe(false);
			expect(diff?.error?.name).toBe("AssertionError");
			expect(diff?.error?.matcherName).toBe("toEqual");
			expect(diff?.error?.actualPreview).toContain('"b":2');
			expect(diff?.error?.expectedPreview).toContain('"b":3');

			const causeCase = byName.get("error with cause");
			expect(causeCase?.ok).toBe(false);
			expect(causeCase?.error?.message).toBe("outer");
			expect(causeCase?.error?.cause?.message).toBe("inner reason");

			// toThrow wraps the user's throwing function and asserts message.
			const toThrowCase = byName.get("toThrow expectation works");
			expect(toThrowCase?.ok).toBe(true);
		},
		TEST_TIMEOUT_MS,
	);

	test(
		"hooks.fixture: beforeAll/beforeEach/afterEach inheritance order is correct",
		async () => {
			const { results } = await runUserFile({
				userFile: fixturePath("hooks.fixture.ts"),
			});

			expect(results).toHaveLength(3);
			for (const r of results) {
				if (!r.ok) {
					throw new Error(
						`expected all hook tests to pass — ${r.name}: ${r.error?.message ?? "<no error>"}`,
					);
				}
			}
		},
		TEST_TIMEOUT_MS,
	);

	test(
		"done-callback.fixture: tests/hooks taking a `done` arg block until done() is called",
		async () => {
			const { results } = await runUserFile({
				userFile: fixturePath("done-callback.fixture.ts"),
			});

			expect(results).toHaveLength(3);
			const byName = new Map(results.map((r) => [r.name, r]));

			const waits = byName.get("waits for done() before resolving the test");
			expect(waits?.ok).toBe(true);
			// The test takes ~20ms because of the setTimeout — proves we waited.
			expect(waits?.durationMs ?? 0).toBeGreaterThanOrEqual(15);

			const failure = byName.get("done(err) reports a failure");
			expect(failure?.ok).toBe(false);
			expect(failure?.error?.message).toBe("intentional async failure");

			const hooksRan = byName.get("hooks fired in order around this test");
			expect(hooksRan?.ok).toBe(true);
		},
		TEST_TIMEOUT_MS,
	);
});
