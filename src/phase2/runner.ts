import { buildHtmlPage } from "./build";
import type { TestResult } from "./types";
import { SENTINEL_PREFIX } from "./types";

export interface ConsoleLine {
	readonly type: string;
	readonly args: ReadonlyArray<unknown>;
}

export interface RunOptions {
	readonly userFile: string;
}

export interface RunResult {
	readonly results: readonly TestResult[];
	readonly sentinelResults: readonly TestResult[];
	readonly consoleLines: readonly ConsoleLine[];
}

/**
 * Bundle the user file with the `bun:test` shim, drive a `Bun.WebView`,
 * and surface results back to the host through both `evaluate()` and the
 * `__BTR__:` console sentinel.
 *
 * @throws {Error} If the build fails or the WebView cannot navigate.
 */
export const runUserFile = async (options: RunOptions): Promise<RunResult> => {
	const html = await buildHtmlPage({ userFile: options.userFile });
	const consoleLines: ConsoleLine[] = [];
	const sentinelResults: TestResult[] = [];

	await using view = new Bun.WebView({
		console: (type, ...args) => {
			consoleLines.push({ type, args });
			const first = args[0];
			if (
				type === "log" &&
				typeof first === "string" &&
				first.startsWith(SENTINEL_PREFIX)
			) {
				try {
					const decoded = JSON.parse(
						first.slice(SENTINEL_PREFIX.length),
					) as TestResult;
					sentinelResults.push(decoded);
				} catch {
					// ignore malformed sentinel
				}
			}
		},
	});

	const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
	await view.navigate(dataUrl);

	const results = (await view.evaluate("window.__btrRun()")) as TestResult[];
	return { results, sentinelResults, consoleLines };
};
