import type { TestResult } from "../types";
import { harness } from "./harness";
import { SENTINEL_PREFIX } from "../types";

// Side-effect import: the user file's top-level `test(...)` / `describe(...)`
// calls run during evaluation and register on the singleton harness.
// The plugin resolves "btr:user-file" to the absolute path of the file under test.
import "btr:user-file";

const run = async (): Promise<TestResult[]> => {
  const results = await harness.run();
  for (const r of results) {
    console.log(`${SENTINEL_PREFIX}${JSON.stringify(r)}`);
  }
  return results;
};

(globalThis as { __btrRun?: () => Promise<TestResult[]> }).__btrRun = run;
