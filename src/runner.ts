import { buildHtmlPage } from "./build";
import {
	type ConsoleHandler,
	getSharedDriver,
	type WebViewDriver,
} from "./driver";
import {
	SENTINEL_PREFIX,
	type TestResult,
	type TestResultWithMeta,
} from "./types";

/**
 * When `BTR_FORWARD_CONSOLE=1` is set, browser-side `console.*` calls are
 * piped to the host process so users can `console.log` from inside a
 * `"use browser"` test and actually see the output in `bun test`. Sentinel
 * lines used by the in-browser harness to ship results back to the host are
 * filtered out so they don't pollute the report.
 */
const isConsoleForwardingEnabled = (): boolean =>
	process.env.BTR_FORWARD_CONSOLE === "1" ||
	process.env.BTR_FORWARD_CONSOLE === "true";

const forwardingConsoleHandler: ConsoleHandler = (type, ...args) => {
	const [first] = args;
	if (typeof first === "string" && first.startsWith(SENTINEL_PREFIX)) return;
	const target = (
		console as unknown as Record<
			string,
			((...a: unknown[]) => void) | undefined
		>
	)[type];
	if (typeof target === "function") {
		target(...args);
		return;
	}
	console.log(...args);
};

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

interface BrowserLoadError {
	readonly message: string;
	readonly stack?: string;
	readonly name?: string;
}

const isBrowserLoadError = (v: unknown): v is BrowserLoadError =>
	typeof v === "object" &&
	v !== null &&
	typeof (v as { message?: unknown }).message === "string";

const probeLoadError = async (lease: {
	view: Bun.WebView;
}): Promise<BrowserLoadError | undefined> => {
	try {
		const raw = await lease.view.evaluate("window.__btrLoadError ?? null");
		return isBrowserLoadError(raw) ? raw : undefined;
	} catch {
		return undefined;
	}
};

const errorFromBrowserLoad = (userFile: string, e: BrowserLoadError): Error => {
	const label = e.name !== undefined && e.name !== "Error" ? `${e.name}: ` : "";
	const err = new Error(
		`"use browser" file failed during module evaluation\n` +
			`  file: ${userFile}\n` +
			`  cause: ${label}${e.message}\n` +
			"  hint: this happens when top-level code in your test file throws " +
			"before any test() / describe() runs (e.g. a SyntaxError, a ReferenceError, " +
			"or a thrown setup expression). Move the failing code inside a test() block " +
			"or fix the underlying error.",
	);
	if (e.stack !== undefined) err.stack = e.stack;
	return err;
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
 * @throws {Error} if the bundle build fails, the WebView cannot navigate, or
 *   the user file threw at module-evaluation time before registering tests.
 */
export const runUserFileWithDriver = async (
	options: RunUserFileOptions,
): Promise<RunResult> => {
	const html = await buildHtmlPage({ userFile: options.userFile });
	const driver = options.driver ?? getSharedDriver();
	const lease = await driver.acquire();

	try {
		if (isConsoleForwardingEnabled()) {
			lease.setConsoleHandler(forwardingConsoleHandler);
		}
		const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
		await lease.view.navigate(dataUrl);

		// __btrRun is installed synchronously at the top of the runtime entry,
		// so it should always be present after navigation succeeds. If it isn't,
		// the bundled module itself failed to evaluate (e.g. a SyntaxError in
		// the user file that survived bundling, or a missing import). Surface
		// a clear message instead of letting evaluate() throw "is not a function".
		const hasRunner = (await lease.view.evaluate(
			"typeof window.__btrRun === 'function'",
		)) as boolean;
		if (!hasRunner) {
			const loadError = await probeLoadError(lease);
			if (loadError !== undefined) {
				throw errorFromBrowserLoad(options.userFile, loadError);
			}
			throw new Error(
				`"use browser" file did not initialise the in-browser test harness\n` +
					`  file: ${options.userFile}\n` +
					"  cause: window.__btrRun was never installed by the bundled module.\n" +
					"  hint: the bundled module likely failed to evaluate. Try running " +
					"with BTR_FORWARD_CONSOLE=1 to see browser-side console output.",
			);
		}

		let results: readonly TestResult[];
		try {
			results = (await lease.view.evaluate(
				"window.__btrRun()",
			)) as readonly TestResult[];
		} catch (runErr) {
			// __btrRun() rejects when the user file threw at module-eval time.
			// Prefer the structured payload the runtime entry stashed on
			// window.__btrLoadError — it preserves the original name/stack.
			const loadError = await probeLoadError(lease);
			if (loadError !== undefined) {
				throw errorFromBrowserLoad(options.userFile, loadError);
			}
			throw runErr;
		}

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
