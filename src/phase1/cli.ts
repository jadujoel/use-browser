import { runPhaseOne } from "./runner";
import type { SerializedError, TestResult } from "./types";

const summarizeStack = (stack: string): string => {
  // Phase 1 uses a data: URL, so script locations are huge encoded blobs.
  // For CLI readability, count frames and show a placeholder; full stacks
  // still round-trip on the wire (verified by e2e tests). Phase 2 will move
  // to served URLs and surface real frames.
  const frames = stack.split("\n").filter((l) => l.length > 0).length;
  return `<${frames} frame${frames === 1 ? "" : "s"} (data: URL — Phase 2 will produce readable frames)>`;
};

const formatError = (err: SerializedError | undefined): string => {
  if (err === undefined) return "";
  const stack = err.stack ?? "";
  const stackLine = stack === "" ? "" : `\n      ${summarizeStack(stack)}`;
  return `\n      ${err.name}: ${err.message}${stackLine}`;
};

const formatResult = (r: TestResult): string => {
  const mark = r.ok ? "PASS" : "FAIL";
  return `  [${mark}] ${r.name} (${r.durationMs.toFixed(1)}ms)${formatError(r.error)}`;
};

const main = async (): Promise<number> => {
  const { results, consoleLines, sentinelResults } = await runPhaseOne();

  console.log("=== via view.evaluate('window.__btrRun()') ===");
  for (const r of results) console.log(formatResult(r));

  console.log(`\n=== via __BTR__ console sentinel (${sentinelResults.length} captured) ===`);
  for (const r of sentinelResults) console.log(formatResult(r));

  console.log(`\n=== console capture: ${consoleLines.length} lines ===`);
  for (const line of consoleLines) {
    const head = line.args[0];
    if (typeof head === "string" && head.startsWith("__BTR__:")) continue;
    console.log(`  [${line.type}] ${line.args.map((a) => String(a)).join(" ")}`);
  }

  const failures = results.filter((r) => !r.ok && r.name !== "intentional failure carries a stack trace");
  return failures.length === 0 ? 0 : 1;
};

const exitCode = await main();
process.exit(exitCode);
