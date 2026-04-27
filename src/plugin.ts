import type { BunPlugin } from "bun";
import {
	MODULE_BUN_TEST,
	MODULE_USE_BROWSER_CONTEXT,
	MODULE_USER_FILE,
} from "./constants";

export interface BunTestPluginOptions {
	/** Absolute path of the user test file to bundle in. */
	readonly userFile: string;
	/** Absolute path of the browser-side `bun:test` shim. */
	readonly shimPath: string;
	/** Absolute path of the browser-side `use-browser/context` module. */
	readonly contextPath: string;
}

/**
 * Bun.build plugin that:
 * - resolves `bun:test` imports to our browser-side shim
 * - resolves the virtual `btr:user-file` import (used by the runtime entry)
 *   to the absolute path of the user's test file
 * - resolves `use-browser/context` to the page-side `userEvent` / `page`
 *   helpers so user tests can `import { userEvent } from "use-browser/context"`
 */
const exact = (specifier: string): RegExp =>
	new RegExp(`^${specifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);

export const bunTestPlugin = (options: BunTestPluginOptions): BunPlugin => ({
	name: "btr-bun-test-shim",
	setup: (build) => {
		build.onResolve({ filter: exact(MODULE_BUN_TEST) }, () => ({
			path: options.shimPath,
		}));
		build.onResolve({ filter: exact(MODULE_USER_FILE) }, () => ({
			path: options.userFile,
		}));
		build.onResolve({ filter: exact(MODULE_USE_BROWSER_CONTEXT) }, () => ({
			path: options.contextPath,
		}));
	},
});
