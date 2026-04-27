/**
 * Public programmatic API.
 *
 * Most users only need the bunfig preload (`use-browser/preload`) and the
 * `"use browser"` directive at the top of their test file. This entry point
 * exists for advanced cases — running a user file against a custom driver,
 * pre-warming the pool from a fixture, or building tooling on top.
 */

export {
	type BuildBundleOptions,
	type BuildHtmlPageOptions,
	buildBundle,
	buildHtmlPage,
} from "./src/build";
export {
	DEFAULT_CONSOLE_DEPTH,
	ENV,
	MODULE_BUN_TEST,
	MODULE_USE_BROWSER_CONTEXT,
	MODULE_USER_FILE,
	USE_BROWSER_DIRECTIVE,
} from "./src/constants";
export { hasUseBrowserDirective } from "./src/detect-directive";
export {
	type Backend,
	type ConsoleHandler,
	getSharedDriver,
	type Lease,
	resetSharedDriverForTesting,
	WebViewDriver,
} from "./src/driver";
export { resultToError } from "./src/replay";
export {
	type RunResult,
	type RunUserFileOptions,
	runUserFileWithDriver,
} from "./src/runner";
export type {
	SerializedError,
	TestResult,
	TestResultWithMeta,
} from "./src/types";
