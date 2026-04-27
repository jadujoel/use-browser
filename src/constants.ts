/**
 * Centralized constants shared across the host and browser sides.
 *
 * Keeping every magic string in one place makes it easy to grep, easy to
 * rename, and avoids the "string literal duplicated four times" pattern.
 */

/** The directive that opts a test file into WebView execution. */
export const USE_BROWSER_DIRECTIVE = "use browser" as const;

/** Module specifiers resolved by the bundler plugin. */
export const MODULE_BUN_TEST = "bun:test" as const;
export const MODULE_USER_FILE = "btr:user-file" as const;
export const MODULE_USE_BROWSER_CONTEXT = "use-browser/context" as const;

/** Environment variables consumed by the host driver/runner. */
export const ENV = {
	FORWARD_CONSOLE: "BTR_FORWARD_CONSOLE",
	POOL_SIZE: "BTR_POOL_SIZE",
	BACKEND: "BTR_BACKEND",
	CONSOLE_DEPTH: "BTR_CONSOLE_DEPTH",
} as const;

/**
 * Default nesting depth used when the in-browser console patch snapshots
 * host objects (AudioContext, DOM nodes, etc.) for forwarding to the host.
 */
export const DEFAULT_CONSOLE_DEPTH = 3 as const;
