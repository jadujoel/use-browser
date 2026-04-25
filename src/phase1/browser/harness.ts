import type { SerializedError, TestResult } from "../types";
import { SENTINEL_PREFIX } from "../types";

interface BrowserTest {
  readonly name: string;
  readonly fn: () => void | Promise<void>;
}

declare global {
  interface Window {
    __btrRun?: () => Promise<TestResult[]>;
  }
}

const serializeError = (err: unknown): SerializedError => {
  if (err instanceof Error) {
    if (err.stack !== undefined) {
      return { name: err.name, message: err.message, stack: err.stack };
    }
    return { name: err.name, message: err.message };
  }
  return { name: "Error", message: String(err) };
};

const tests: readonly BrowserTest[] = [
  {
    name: "renders into a real DOM",
    fn: () => {
      document.body.innerHTML = "<h1>hi</h1>";
      const heading = document.querySelector("h1");
      if (heading?.textContent !== "hi") {
        throw new Error(`expected DOM to render, got ${heading?.textContent ?? "<null>"}`);
      }
    },
  },
  {
    name: "real CSS layout is applied",
    fn: () => {
      const div = document.createElement("div");
      div.style.width = "120px";
      div.style.height = "40px";
      document.body.appendChild(div);
      const rect = div.getBoundingClientRect();
      if (rect.width !== 120 || rect.height !== 40) {
        throw new Error(`expected 120x40, got ${rect.width}x${rect.height}`);
      }
    },
  },
  {
    name: "console.log is captured by the host",
    fn: () => {
      console.log("hello from browser");
    },
  },
  {
    name: "intentional failure carries a stack trace",
    fn: () => {
      throw new Error("expected failure");
    },
  },
];

const runOne = async (t: BrowserTest): Promise<TestResult> => {
  const started = performance.now();
  try {
    await t.fn();
    return { name: t.name, ok: true, durationMs: performance.now() - started };
  } catch (err) {
    return {
      name: t.name,
      ok: false,
      durationMs: performance.now() - started,
      error: serializeError(err),
    };
  }
};

const run = async (): Promise<TestResult[]> => {
  const results: TestResult[] = [];
  for (const t of tests) {
    const r = await runOne(t);
    results.push(r);
    console.log(`${SENTINEL_PREFIX}${JSON.stringify(r)}`);
  }
  return results;
};

window.__btrRun = run;
