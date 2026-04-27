import { wrapAsHostTest } from "../phase4/wrap-source";
import { hasUseBrowserDirective } from "./detect-directive";

// Restrict to filenames that look like test files. Production users will only
// hit `.test.` / `.spec.`; `.fixture.` is included so this package's own e2e
// fixtures work without a separate codepath.
const TEST_FILE_FILTER = /\.(test|spec|fixture)\.(tsx?|jsx?)$/;

const loaderForPath = (path: string): "ts" | "tsx" | "js" | "jsx" => {
	if (path.endsWith(".tsx")) return "tsx";
	if (path.endsWith(".jsx")) return "jsx";
	if (path.endsWith(".js")) return "js";
	return "ts";
};

Bun.plugin({
	name: "btr-use-browser",
	setup(build) {
		// We always return `{ contents, loader }` rather than `undefined` for
		// pass-through. In Bun's test runner the plugin pipeline overlaps with the
		// module-mock pipeline, and a bare `undefined` is treated as a failed mock
		// rather than a transformer pass-through.
		build.onLoad({ filter: TEST_FILE_FILTER }, async ({ path }) => {
			const src = await Bun.file(path).text();
			const loader = loaderForPath(path);
			if (!hasUseBrowserDirective(src)) {
				return { contents: src, loader };
			}
			return { contents: wrapAsHostTest(path), loader: "ts" };
		});
	},
});
