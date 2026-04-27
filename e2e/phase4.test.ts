import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { WebViewDriver } from "../src/phase4/driver";
import { resultToError } from "../src/phase4/replay";
import { runUserFileWithDriver } from "../src/phase4/runner";

const TEST_TIMEOUT_MS = 60_000;

const fixturePath = (name: string): string =>
	new URL(`./fixtures/phase3/${name}`, import.meta.url).pathname;

const phase2FixturePath = (name: string): string =>
	new URL(`./fixtures/phase2/${name}`, import.meta.url).pathname;

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

describe("phase 4 — driver + reporter integration", () => {
	beforeAll(async () => {
		await rm("./test-results", { recursive: true, force: true });
	});

	afterAll(async () => {
		await rm("./test-results", { recursive: true, force: true });
	});

	test(
		"passing fixture: every browser test shows up as its own host test",
		async () => {
			const result = await runBunTest("use-browser-passing.fixture.ts");
			if (result.exitCode !== 0) {
				throw new Error(
					`expected exit 0, got ${result.exitCode}\n${result.combined}`,
				);
			}
			// The passing fixture has two tests — both should be reported
			// individually instead of being collapsed under one host test
			// (phase 3 would have shown "1 pass" because it surfaced a single
			// host test wrapping all browser tests).
			expect(result.combined).toContain("2 pass");
			expect(result.combined).toContain("0 fail");
		},
		TEST_TIMEOUT_MS,
	);

	test(
		"failing fixture: surfaces individual failure with screenshot path",
		async () => {
			const result = await runBunTest("use-browser-failing.fixture.ts");
			expect(result.exitCode).not.toBe(0);
			expect(result.combined).toContain("intentional fail");
			expect(result.combined).toContain("screenshot:");

			// Screenshot file should exist on disk.
			const screenshot = Bun.file(
				"./test-results/use_browser_failing_fixture.png",
			);
			expect(await screenshot.exists()).toBe(true);
			const size = screenshot.size;
			expect(size).toBeGreaterThan(0);
		},
		TEST_TIMEOUT_MS,
	);
});

describe("phase 4 — direct driver/runner usage", () => {
	test(
		"runUserFileWithDriver returns per-test results and writes a screenshot on failure",
		async () => {
			const screenshotsDir = "./test-results-direct";
			await rm(screenshotsDir, { recursive: true, force: true });
			try {
				const driver = WebViewDriver.from({ maxSize: 1 });
				try {
					const out = await runUserFileWithDriver({
						userFile: phase2FixturePath("failing.fixture.ts"),
						screenshotsDir,
						driver,
					});
					expect(out.results).toHaveLength(3);
					const failing = out.results.filter((r) => !r.ok);
					expect(failing.length).toBeGreaterThan(0);
					expect(out.screenshotPath).toBeDefined();
					if (out.screenshotPath !== undefined) {
						expect(await Bun.file(out.screenshotPath).exists()).toBe(true);
					}
					// resultToError stamps the screenshot path onto the error message.
					const first = failing[0];
					if (first === undefined) throw new Error("expected a failing result");
					const err = resultToError(first);
					expect(err.message).toContain("screenshot:");
				} finally {
					driver.close();
				}
			} finally {
				await rm(screenshotsDir, { recursive: true, force: true });
			}
		},
		TEST_TIMEOUT_MS,
	);

	test(
		"WebViewDriver pool reuses idle views across leases",
		async () => {
			const driver = WebViewDriver.from({ maxSize: 1 });
			try {
				const lease1 = await driver.acquire();
				const firstView = lease1.view;
				lease1.release();
				const lease2 = await driver.acquire();
				expect(lease2.view).toBe(firstView);
				lease2.release();
				expect(driver.stats().idle).toBe(1);
				expect(driver.stats().busy).toBe(0);
			} finally {
				driver.close();
			}
		},
		TEST_TIMEOUT_MS,
	);

	test(
		"WebViewDriver respects maxSize and queues subsequent acquirers",
		async () => {
			const driver = WebViewDriver.from({ maxSize: 1 });
			try {
				const lease1 = await driver.acquire();
				let lease2Resolved = false;
				const lease2Promise = driver.acquire().then((l) => {
					lease2Resolved = true;
					return l;
				});
				// Should not have resolved yet — pool is full.
				await Bun.sleep(10);
				expect(lease2Resolved).toBe(false);

				lease1.release();
				const lease2 = await lease2Promise;
				expect(lease2Resolved).toBe(true);
				expect(lease2.view).toBe(lease1.view);
				lease2.release();
			} finally {
				driver.close();
			}
		},
		TEST_TIMEOUT_MS,
	);
});
