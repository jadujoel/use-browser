import { describe, expect, test } from "bun:test";

const TEST_TIMEOUT_MS = 60_000;

const fixturePath = (name: string): string =>
	new URL(`./fixtures/phase3/${name}`, import.meta.url).pathname;

interface SpawnResult {
	readonly stdout: string;
	readonly stderr: string;
	readonly combined: string;
	readonly exitCode: number;
}

const runBunTestWithCoverage = async (
	fixture: string,
	extraArgs: ReadonlyArray<string> = [],
): Promise<SpawnResult> => {
	const proc = Bun.spawn({
		cmd: ["bun", "test", "--coverage", ...extraArgs, fixture],
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

describe("coverage — bun's built-in --coverage works with 'use browser'", () => {
	test(
		"table reporter includes the user fixture file with line coverage",
		async () => {
			const fixture = fixturePath("use-browser-passing.fixture.ts");
			const result = await runBunTestWithCoverage(fixture);
			if (result.exitCode !== 0) {
				throw new Error(
					`expected exit 0, got ${result.exitCode}\n${result.combined}`,
				);
			}
			// The user's original fixture path appears in the coverage table —
			// bun's coverage maps the wrapped/preloaded source back to the
			// on-disk file.
			expect(result.combined).toContain("use-browser-passing.fixture.ts");
			// Tests still pass under --coverage.
			expect(result.combined).toContain("2 pass");
			expect(result.combined).toContain("0 fail");
			// Standard table-reporter header.
			expect(result.combined).toContain("% Funcs");
			expect(result.combined).toContain("% Lines");
		},
		TEST_TIMEOUT_MS,
	);

	test(
		"failure path: --coverage on a failing fixture still produces a report",
		async () => {
			const fixture = fixturePath("use-browser-failing.fixture.ts");
			const result = await runBunTestWithCoverage(fixture);
			expect(result.exitCode).not.toBe(0);
			expect(result.combined).toContain("use-browser-failing.fixture.ts");
			expect(result.combined).toContain("intentional fail");
			expect(result.combined).toContain("% Lines");
		},
		TEST_TIMEOUT_MS,
	);
});
