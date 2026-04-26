import type { BunPlugin } from "bun";

export interface BunTestPluginOptions {
  /** Absolute path of the user test file to bundle in. */
  readonly userFile: string;
  /** Absolute path of the browser-side `bun:test` shim. */
  readonly shimPath: string;
}

/**
 * Bun.build plugin that:
 * - resolves `bun:test` imports to our browser-side shim
 * - resolves the virtual `btr:user-file` import (used by the runtime entry)
 *   to the absolute path of the user's test file
 */
export const bunTestPlugin = (options: BunTestPluginOptions): BunPlugin => ({
  name: "btr-bun-test-shim",
  setup(build) {
    build.onResolve({ filter: /^bun:test$/ }, () => ({
      path: options.shimPath,
    }));
    build.onResolve({ filter: /^btr:user-file$/ }, () => ({
      path: options.userFile,
    }));
  },
});
