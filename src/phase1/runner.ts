import { buildHtmlPage } from "./build";
import type { TestResult } from "./types";
import { SENTINEL_PREFIX } from "./types";

export interface ConsoleLine {
  readonly type: string;
  readonly args: ReadonlyArray<unknown>;
}

export interface PhaseOneRunResult {
  /** Results returned by `view.evaluate("window.__btrRun()")`. */
  readonly results: readonly TestResult[];
  /** Every `console.*` call captured from the page, in arrival order. */
  readonly consoleLines: readonly ConsoleLine[];
  /** Results decoded from the `__BTR__:` sentinel-prefixed console lines. */
  readonly sentinelResults: readonly TestResult[];
}

export interface PhaseOneRunOptions {
  /** Pre-built HTML page. If omitted, the harness is built fresh via `Bun.build`. */
  readonly htmlPage?: string;
}

/**
 * Run the Phase 1 proof-of-concept: bundle the browser harness, drive a `Bun.WebView`,
 * and surface results back to the host through both `evaluate()` and a console sentinel.
 *
 * @throws {Error} If the build fails, the WebView cannot navigate, or the harness throws
 *   outside an individual test (e.g. a top-level syntax error in the bundle).
 */
export const runPhaseOne = async (
  options: PhaseOneRunOptions = {},
): Promise<PhaseOneRunResult> => {
  const html = options.htmlPage ?? (await buildHtmlPage());
  const consoleLines: ConsoleLine[] = [];
  const sentinelResults: TestResult[] = [];

  await using view = new Bun.WebView({
    console: (type, ...args) => {
      consoleLines.push({ type, args });
      const first = args[0];
      if (
        type === "log" &&
        typeof first === "string" &&
        first.startsWith(SENTINEL_PREFIX)
      ) {
        try {
          const decoded = JSON.parse(first.slice(SENTINEL_PREFIX.length)) as TestResult;
          sentinelResults.push(decoded);
        } catch {
          // ignore malformed sentinel lines
        }
      }
    },
  });

  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  await view.navigate(dataUrl);

  const results = (await view.evaluate("window.__btrRun()")) as TestResult[];

  return { results, consoleLines, sentinelResults };
};
