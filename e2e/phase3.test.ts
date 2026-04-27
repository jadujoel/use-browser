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

const runBunTest = async (fixture: string): Promise<SpawnResult> => {
	// The preload is auto-loaded from bunfig.toml — the spawned `bun test`
	// inherits cwd and reads the same config, so we don't pass --preload
	// here (doing so would register the plugin twice).
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

describe("phase 3 — directive routing", () => {
	test(
		"files without the directive pass through and run on the host",
		async () => {
			const result = await runBunTest("no-directive.fixture.ts");
			if (result.exitCode !== 0) {
				throw new Error(
					`expected exit 0, got ${result.exitCode}\n${result.combined}`,
				);
			}
			expect(result.combined).toContain("1 pass");
		},
		TEST_TIMEOUT_MS,
	);
});

describe("phase 3 — directive parser unit checks", () => {
	test("recognizes the directive", async () => {
		const { hasUseBrowserDirective } = await import("../src/detect-directive");
		expect(hasUseBrowserDirective(`"use browser";\nconst x = 1;`)).toBe(true);
		expect(hasUseBrowserDirective(`'use browser';`)).toBe(true);
		expect(hasUseBrowserDirective(`// leading comment\n"use browser";`)).toBe(
			true,
		);
		expect(hasUseBrowserDirective(`/* block */\n"use browser";`)).toBe(true);
		expect(hasUseBrowserDirective(`\n\n"use browser";`)).toBe(true);
		expect(hasUseBrowserDirective(`#!/usr/bin/env bun\n"use browser";`)).toBe(
			true,
		);
	});

	test("rejects when not at top", async () => {
		const { hasUseBrowserDirective } = await import("../src/detect-directive");
		expect(hasUseBrowserDirective(`const x = 1;\n"use browser";`)).toBe(false);
		expect(hasUseBrowserDirective(`"use strict";\n"use browser";`)).toBe(false);
		expect(hasUseBrowserDirective(``)).toBe(false);
		expect(hasUseBrowserDirective(`// "use browser"`)).toBe(false);
	});
});
