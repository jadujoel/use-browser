const RUNNER_PATH = new URL("../phase2/runner.ts", import.meta.url).pathname;

/**
 * Generate the replacement source for a test file carrying the `"use browser"`
 * directive. The replacement registers a single host-side `test(filename, ...)`
 * that bundles the original file with the `bun:test` shim, runs it inside
 * `Bun.WebView`, and re-throws if any child test failed.
 *
 * Phase 3 collapses all child results under one host test. Phase 4 will split
 * them out so `bun test`'s reporter shows each test individually.
 */
export const wrapAsHostTest = (userFile: string): string => {
  const userFileLiteral = JSON.stringify(userFile);
  const runnerLiteral = JSON.stringify(RUNNER_PATH);
  return [
    `import { test } from "bun:test";`,
    `import { runUserFile } from ${runnerLiteral};`,
    ``,
    `test(${userFileLiteral}, async () => {`,
    `  const { results } = await runUserFile({ userFile: ${userFileLiteral} });`,
    `  const failures = results.filter((r) => !r.ok);`,
    `  if (failures.length === 0) return;`,
    `  const summary = failures`,
    `    .map((r) => "  " + r.name + ": " + (r.error?.message ?? "<no error>"))`,
    `    .join("\\n");`,
    `  throw new Error(`,
    `    "Browser tests failed (" + failures.length + "/" + results.length + "):\\n" + summary,`,
    `  );`,
    `});`,
    ``,
  ].join("\n");
};
