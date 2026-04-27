import { buildHtmlPage } from "../phase2/build";
import type { TestResult } from "../phase2/types";
import { getSharedDriver, type WebViewDriver } from "./driver";
import type { TestResultWithMeta } from "./types";

export interface RunUserFileOptions {
	readonly userFile: string;
	/**
	 * Where to write screenshots. Defaults to `./test-results` under the
	 * current working directory.
	 */
	readonly screenshotsDir?: string;
	/**
	 * Override the shared driver — primarily for tests that want isolation.
	 */
	readonly driver?: WebViewDriver;
}

export interface RunResult {
	readonly results: readonly TestResultWithMeta[];
	readonly screenshotPath?: string;
}

const slugify = (input: string): string => {
	const base = input.split("/").pop() ?? input;
	const noExt = base.replace(/\.[tj]sx?$/, "");
	return noExt.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "test";
};

/**
 * Bundle a user file, lease a pooled WebView, run the bundled tests inside it,
 * and return the per-test results. On any failure also writes a screenshot of
 * the final page state and surfaces its path back to the caller — the caller
 * is responsible for attaching the path to the matching test's error message.
 *
 * v1 takes a single screenshot per file (the final DOM state after all tests).
 * Per-test screenshots would require driving tests one-at-a-time from the host
 * side, which is deferred until the harness exposes a single-test entry point.
 *
 * @throws {Error} if the bundle build fails or the WebView cannot navigate.
 */
export const runUserFileWithDriver = async (
	options: RunUserFileOptions,
): Promise<RunResult> => {
	const html = await buildHtmlPage({ userFile: options.userFile });
	const driver = options.driver ?? getSharedDriver();
	const lease = await driver.acquire();

	try {
		const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
		await lease.view.navigate(dataUrl);
		const results = (await lease.view.evaluate(
			"window.__btrRun()",
		)) as readonly TestResult[];

		const failureCount = results.reduce((n, r) => (r.ok ? n : n + 1), 0);
		let screenshotPath: string | undefined;
		if (failureCount > 0) {
			const dir = options.screenshotsDir ?? "./test-results";
			const candidate = `${dir}/${slugify(options.userFile)}.png`;
			try {
				const buf = await lease.view.screenshot({
					encoding: "buffer",
					format: "png",
				});
				await Bun.write(candidate, buf);
				screenshotPath = candidate;
			} catch {
				// Screenshot is best-effort — failing here must not mask the
				// actual test failure.
			}
		}

		const augmented: TestResultWithMeta[] = results.map((r) => {
			if (r.ok || screenshotPath === undefined) return r;
			return { ...r, screenshotPath };
		});

		if (screenshotPath !== undefined) {
			return { results: augmented, screenshotPath };
		}
		return { results: augmented };
	} finally {
		try {
			await lease.view.navigate("about:blank");
		} catch {
			// View may be in a bad state — release anyway so the slot frees up.
		}
		lease.release();
	}
};
