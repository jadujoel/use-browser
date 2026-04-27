import { MODULE_BUN_TEST } from "./constants";

const RUNNER_PATH = new URL("./runner.ts", import.meta.url).pathname;
const REPLAY_PATH = new URL("./replay.ts", import.meta.url).pathname;

/**
 * Replacement source for a test file carrying the `"use browser"` directive.
 *
 * Phase 4 strategy:
 * 1. Top-level `await` runs the bundled user file inside a pooled WebView and
 *    collects per-test results.
 * 2. We then register each child test as an individual host-side `bun:test`
 *    `test(...)` inside a `describe(<file>, ...)`. The body just rethrows the
 *    rehydrated error if the child failed.
 *
 * This makes the `bun test` reporter, `--bail`, JUnit output, and timing all
 * "just work" — each browser test shows up as its own line in the report.
 */
export const wrapAsHostTest = (userFile: string): string => {
	const userFileLiteral = JSON.stringify(userFile);
	const runnerLiteral = JSON.stringify(RUNNER_PATH);
	const replayLiteral = JSON.stringify(REPLAY_PATH);
	return [
		`import { describe, test } from ${JSON.stringify(MODULE_BUN_TEST)};`,
		`import { runUserFileWithDriver } from ${runnerLiteral};`,
		`import { resultToError } from ${replayLiteral};`,
		``,
		`const __btrOutcome = await (async () => {`,
		`  try {`,
		`    const out = await runUserFileWithDriver({ userFile: ${userFileLiteral} });`,
		`    return { ok: true, value: out };`,
		`  } catch (err) {`,
		`    return { ok: false, error: err instanceof Error ? err : new Error(String(err)) };`,
		`  }`,
		`})();`,
		``,
		`describe(${userFileLiteral}, () => {`,
		`  if (!__btrOutcome.ok) {`,
		`    test("<file run>", () => { throw __btrOutcome.error; });`,
		`    return;`,
		`  }`,
		`  for (const result of __btrOutcome.value.results) {`,
		`    test(result.name, () => {`,
		`      if (result.ok) return;`,
		`      throw resultToError(result);`,
		`    });`,
		`  }`,
		`});`,
		``,
	].join("\n");
};
