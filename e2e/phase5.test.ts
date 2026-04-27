import { describe, expect, test } from "bun:test";
import { mock } from "../src/phase5/browser/mock";

const TEST_TIMEOUT_MS = 60_000;

const fixturePath = (name: string): string =>
	new URL(`./fixtures/phase5/${name}`, import.meta.url).pathname;

interface SpawnResult {
	readonly stdout: string;
	readonly stderr: string;
	readonly combined: string;
	readonly exitCode: number;
}

const runBunTest = async (fixture: string): Promise<SpawnResult> => {
	const proc = Bun.spawn({
		cmd: ["bun", "test", fixturePath(fixture)],
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	const exitCode = await proc.exited;
	return { stdout, stderr, combined: stdout + stderr, exitCode };
};

describe("phase 5 — DX polish", () => {
	test(
		"userEvent + page helpers run in WebView and pass under bun test",
		async () => {
			const result = await runBunTest("user-event.fixture.ts");
			if (result.exitCode !== 0) {
				throw new Error(
					`expected exit 0, got ${result.exitCode}\n${result.combined}`,
				);
			}
			expect(result.combined).toContain("5 pass");
			expect(result.combined).toContain("0 fail");
		},
		TEST_TIMEOUT_MS,
	);

	test(
		"mock primitive runs in WebView via the bun:test shim",
		async () => {
			const result = await runBunTest("mock.fixture.ts");
			if (result.exitCode !== 0) {
				throw new Error(
					`expected exit 0, got ${result.exitCode}\n${result.combined}`,
				);
			}
			expect(result.combined).toContain("4 pass");
			expect(result.combined).toContain("0 fail");
		},
		TEST_TIMEOUT_MS,
	);
});

describe("phase 5 — mock primitives (host-side unit checks)", () => {
	test("mock records each call's arguments", () => {
		const fn = mock((x: number) => x + 1);
		fn(1);
		fn(2);
		expect(fn.mock.calls.length).toBe(2);
		expect(fn.mock.calls[0]).toEqual([1]);
		expect(fn.mock.calls[1]).toEqual([2]);
	});

	test("mockImplementation swaps behavior on the fly", () => {
		const fn = mock<[number], number>((x) => x);
		expect(fn(1)).toBe(1);
		fn.mockImplementation((x) => x * 10);
		expect(fn(2)).toBe(20);
	});

	test("mockReset clears history and resets implementation", () => {
		const fn = mock<[], number>(() => 7);
		expect(fn()).toBe(7);
		fn.mockReset();
		expect(fn.mock.calls.length).toBe(0);
		expect(fn()).toBeUndefined();
	});

	test("mockResolvedValue returns a Promise that resolves to the value", async () => {
		const fn = mock<[], Promise<number>>();
		fn.mockResolvedValue(99);
		await expect(fn()).resolves.toBe(99);
	});
});
