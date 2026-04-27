import { type Backend, type ConsoleHandler, WebViewDriver } from "./driver";

/**
 * Options for the programmatic `useBrowser` API.
 *
 * `main` is a self-contained function that runs inside a real browser
 * context. Closure variables from the host process are NOT captured — the
 * function is converted to source via `Function#toString` and evaluated
 * fresh inside the WebView, so it must only reference values available in
 * the browser global scope or values explicitly passed via `parameters`.
 *
 * `parameters` are passed to `main` after being JSON-serialized and parsed
 * inside the browser. They must therefore be JSON-safe (no functions, no
 * cyclic references, no class instances with non-enumerable state).
 */
export interface UseBrowserOptions<TArgs extends readonly unknown[], TResult> {
	readonly backend?: Backend;
	readonly main: (...args: TArgs) => TResult | Promise<TResult>;
	readonly parameters?: TArgs;
	/**
	 * Forward browser-side `console.*` calls to the host process. Defaults
	 * to `true` so users can `console.log` from inside `main` and see output
	 * in their terminal without extra plumbing.
	 */
	readonly forwardConsole?: boolean;
}

const resolveBackend = (backend: Backend | undefined): Backend =>
	backend ?? (process.platform === "darwin" ? "webkit" : "chrome");

const forwardingConsoleHandler: ConsoleHandler = (type, ...args) => {
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

const BLANK_PAGE = [
	"<!doctype html>",
	'<html><head><meta charset="utf-8"><title>use-browser</title></head>',
	"<body></body></html>",
].join("");

const buildEvalScript = (fnSource: string, argsJson: string): string =>
	// Wrap in an async IIFE so both sync and async return values resolve via
	// the WebView evaluate bridge. Errors propagate as a rejected promise
	// that `view.evaluate` surfaces to the host. Arguments are inlined as a
	// JSON literal — equivalent to a structured copy across the boundary.
	`(async () => { const __args = ${argsJson}; return await (${fnSource})(...__args); })()`;

/**
 * Run `main` inside a real browser (WebKit on macOS, Chrome elsewhere) and
 * return its result to the host.
 *
 * The function source is bundled into the page verbatim — keep it
 * self-contained. Pass any host-side data the function needs through
 * `parameters` (JSON-serialized across the boundary).
 *
 * @throws {Error} if the WebView cannot navigate, the function throws, or
 *   the returned value is not structured-clone serializable.
 */
export const useBrowser = async <TArgs extends readonly unknown[], TResult>(
	options: UseBrowserOptions<TArgs, TResult>,
): Promise<TResult> => {
	const driver = WebViewDriver.from({
		backend: resolveBackend(options.backend),
		maxSize: 1,
	});
	const lease = await driver.acquire();
	try {
		if (options.forwardConsole !== false) {
			lease.setConsoleHandler(forwardingConsoleHandler);
		}
		const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(BLANK_PAGE)}`;
		await lease.view.navigate(dataUrl);
		const argsJson = JSON.stringify(options.parameters ?? []);
		const script = buildEvalScript(options.main.toString(), argsJson);
		const result = (await lease.view.evaluate(script)) as TResult;
		return result;
	} finally {
		lease.release();
		driver.close();
	}
};
