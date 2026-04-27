import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TEST_TIMEOUT_MS = 180_000;

const repoRoot = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

interface SpawnResult {
	readonly stdout: string;
	readonly stderr: string;
	readonly combined: string;
	readonly exitCode: number;
}

const run = async (
	cmd: readonly string[],
	cwd: string,
	env?: Record<string, string>,
): Promise<SpawnResult> => {
	const proc = Bun.spawn({
		cmd: [...cmd],
		cwd,
		stdout: "pipe",
		stderr: "pipe",
		env: { ...process.env, ...env },
	});
	const [stdout, stderr] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	const exitCode = await proc.exited;
	return { stdout, stderr, combined: stdout + stderr, exitCode };
};

const SMOKE_TEST_SOURCE = `"use browser";

import { describe, expect, test } from "bun:test";

describe("published-package smoke", () => {
\ttest("renders into a real DOM", () => {
\t\tdocument.body.innerHTML = '<button id="b">hello</button>';
\t\tconst b = document.querySelector<HTMLButtonElement>("#b");
\t\texpect(b?.textContent).toBe("hello");
\t\tb?.click();
\t\texpect(document.body.contains(b)).toBe(true);
\t});
});
`;

const CONSUMER_PACKAGE_JSON = JSON.stringify(
	{
		name: "use-browser-publish-smoke-consumer",
		version: "0.0.0",
		private: true,
		type: "module",
	},
	null,
	2,
);

const CONSUMER_BUNFIG = `[test]
preload = ["use-browser/preload"]
`;

describe("publish smoke", () => {
	let workDir = "";
	let tarballPath = "";
	let consumerDir = "";

	beforeAll(async () => {
		workDir = await mkdtemp(join(tmpdir(), "use-browser-smoke-"));

		// 1. Pack the package as it would be published.
		const packDir = join(workDir, "pack");
		await Bun.write(join(packDir, ".keep"), "");
		const pack = await run(
			["bun", "pm", "pack", "--destination", packDir],
			repoRoot,
		);
		if (pack.exitCode !== 0) {
			throw new Error(`bun pm pack failed:\n${pack.combined}`);
		}
		const entries = await readdir(packDir);
		const tarball = entries.find(
			(name) => name.startsWith("use-browser-") && name.endsWith(".tgz"),
		);
		if (tarball === undefined) {
			throw new Error(
				`no tarball produced in ${packDir}; entries=${entries.join(", ")}`,
			);
		}
		tarballPath = join(packDir, tarball);

		// 2. Build a fresh consumer project that knows nothing about the repo.
		consumerDir = join(workDir, "consumer");
		await Bun.write(join(consumerDir, "package.json"), CONSUMER_PACKAGE_JSON);
		await Bun.write(join(consumerDir, "bunfig.toml"), CONSUMER_BUNFIG);
		await Bun.write(join(consumerDir, "smoke.test.ts"), SMOKE_TEST_SOURCE);

		// 3. Install the packed tarball with no link/cache to the source repo.
		const install = await run(
			["bun", "add", tarballPath],
			consumerDir,
			// Force a clean store so we never accidentally pick up the workspace
			// version via a cached link.
			{ BUN_INSTALL_CACHE_DIR: join(workDir, "bun-cache") },
		);
		if (install.exitCode !== 0) {
			throw new Error(`bun add tarball failed:\n${install.combined}`);
		}
	}, TEST_TIMEOUT_MS);

	afterAll(async () => {
		if (workDir !== "") {
			await rm(workDir, { recursive: true, force: true });
		}
	});

	test(
		"installs from tarball and runs a 'use browser' test in a fresh project",
		async () => {
			const result = await run(["bun", "test", "smoke.test.ts"], consumerDir);
			if (result.exitCode !== 0) {
				throw new Error(
					`expected exit 0, got ${result.exitCode}\n${result.combined}`,
				);
			}
			expect(result.combined).toContain("1 pass");
			expect(result.combined).toContain("0 fail");
		},
		TEST_TIMEOUT_MS,
	);
});
