import { bunTestPlugin } from "./plugin";

export interface BuildBundleOptions {
	/** Absolute path to the user's test file. */
	readonly userFile: string;
}

const RUNTIME_ENTRY = new URL("./browser/runtime-entry.ts", import.meta.url)
	.pathname;
const SHIM_PATH = new URL("./browser/shim.ts", import.meta.url).pathname;
const CONTEXT_PATH = new URL("../phase5/browser/context.ts", import.meta.url)
	.pathname;

/**
 * Bundle a user test file together with the `bun:test` shim and runtime entry.
 * Returns the JS bundle text (ESM, target browser, inline sourcemap).
 *
 * @throws {Error} If `Bun.build` fails or produces no output.
 */
export const buildBundle = async (
	options: BuildBundleOptions,
): Promise<string> => {
	const result = await Bun.build({
		entrypoints: [RUNTIME_ENTRY],
		target: "browser",
		format: "esm",
		sourcemap: "inline",
		plugins: [
			bunTestPlugin({
				userFile: options.userFile,
				shimPath: SHIM_PATH,
				contextPath: CONTEXT_PATH,
			}),
		],
	});
	if (!result.success) {
		const reason = result.logs.map((l) => l.message).join("\n");
		throw new Error(`Bun.build failed: ${reason}`);
	}
	const out = result.outputs[0];
	if (out === undefined) {
		throw new Error("Bun.build produced no outputs");
	}
	return await out.text();
};

/**
 * Wrap a bundle into a minimal HTML page suitable for `Bun.WebView.navigate`.
 * @throws {Error} If `Bun.build` fails (delegated from `buildBundle`).
 */
export const buildHtmlPage = async (
	options: BuildBundleOptions,
): Promise<string> => {
	const bundle = await buildBundle(options);
	return [
		"<!doctype html>",
		'<html><head><meta charset="utf-8"><title>bun-browser-test phase 2</title></head>',
		'<body><script type="module">',
		bundle,
		"</script></body></html>",
	].join("\n");
};
