export interface BuildBrowserHarnessOptions {
	readonly entrypoint?: string;
}

const defaultEntrypoint = (): string => {
	return new URL("./browser/harness.ts", import.meta.url).pathname;
};

/**
 * Bundle the browser-side harness into a single ESM string.
 * @throws {Error} If `Bun.build` fails.
 */
export const buildBrowserHarness = async (
	options: BuildBrowserHarnessOptions = {},
): Promise<string> => {
	const entrypoint = options.entrypoint ?? defaultEntrypoint();
	const result = await Bun.build({
		entrypoints: [entrypoint],
		target: "browser",
		format: "esm",
		minify: false,
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
 * Wrap a bundled harness in a minimal HTML document suitable for `Bun.WebView.navigate`.
 * @throws {Error} If `Bun.build` fails.
 */
export const buildHtmlPage = async (
	options: BuildBrowserHarnessOptions = {},
): Promise<string> => {
	const script = await buildBrowserHarness(options);
	return [
		"<!doctype html>",
		'<html><head><meta charset="utf-8"><title>bun-browser-test phase 1</title></head>',
		'<body><script type="module">',
		script,
		"</script></body></html>",
	].join("\n");
};
