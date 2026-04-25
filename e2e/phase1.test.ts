import { describe, expect, test } from "bun:test";
import { runPhaseOne } from "../src/phase1/runner";
import { SENTINEL_PREFIX } from "../src/phase1/types";

const TEST_TIMEOUT_MS = 30_000;

describe("phase 1 — Bun.WebView capability spike", () => {
  test(
    "loads a data: URL and evaluates an expression",
    async () => {
      await using view = new Bun.WebView({});
      await view.navigate("data:text/html;charset=utf-8,<h1>hi</h1>");
      const text = await view.evaluate("document.querySelector('h1').textContent");
      expect(text).toBe("hi");
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "evaluate() round-trips primitives, arrays, and plain objects",
    async () => {
      await using view = new Bun.WebView({});
      await view.navigate("data:text/html;charset=utf-8,<body></body>");
      const num = (await view.evaluate("42")) as number;
      const arr = (await view.evaluate("[1, 2, 3]")) as readonly number[];
      const obj = (await view.evaluate("({ name: 'bun', ok: true })")) as {
        readonly name: string;
        readonly ok: boolean;
      };
      expect(num).toBe(42);
      expect(arr).toEqual([1, 2, 3]);
      expect(obj).toEqual({ name: "bun", ok: true });
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "console.* calls inside the page are forwarded to the host",
    async () => {
      const captured: { type: string; first: unknown }[] = [];
      await using view = new Bun.WebView({
        console: (type, ...args) => {
          captured.push({ type, first: args[0] });
        },
      });
      await view.navigate(
        "data:text/html;charset=utf-8," +
          encodeURIComponent(
            "<script>console.log('hello'); console.warn('careful');</script>",
          ),
      );
      // Console events deliver before the next round-trip via the same IPC channel.
      await view.evaluate("1");
      const log = captured.find((c) => c.type === "log");
      const warn = captured.find((c) => c.type === "warn");
      expect(log?.first).toBe("hello");
      expect(warn?.first).toBe("careful");
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "evaluate() rejects when the page-side expression throws",
    async () => {
      await using view = new Bun.WebView({});
      await view.navigate("data:text/html;charset=utf-8,<body></body>");
      let thrown: unknown;
      try {
        await view.evaluate("(() => { throw new Error('boom'); })()");
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).message).toContain("boom");
    },
    TEST_TIMEOUT_MS,
  );
});

describe("phase 1 — end-to-end harness", () => {
  test(
    "harness runs four sample tests and surfaces structured results via evaluate()",
    async () => {
      const { results } = await runPhaseOne();

      expect(results).toHaveLength(4);

      const byName = new Map(results.map((r) => [r.name, r]));
      expect(byName.get("renders into a real DOM")?.ok).toBe(true);
      expect(byName.get("real CSS layout is applied")?.ok).toBe(true);
      expect(byName.get("console.log is captured by the host")?.ok).toBe(true);

      const failure = byName.get("intentional failure carries a stack trace");
      expect(failure).toBeDefined();
      expect(failure?.ok).toBe(false);
      expect(failure?.error?.message).toBe("expected failure");
      expect(failure?.error?.name).toBe("Error");
      // Stacks round-trip — readable enough to surface in the host reporter.
      expect(failure?.error?.stack).toBeDefined();
      expect(failure?.error?.stack?.length ?? 0).toBeGreaterThan(0);

      for (const r of results) {
        expect(r.durationMs).toBeGreaterThanOrEqual(0);
      }
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "harness output also reaches the host via the __BTR__ console sentinel",
    async () => {
      const { results, sentinelResults, consoleLines } = await runPhaseOne();

      expect(sentinelResults).toHaveLength(results.length);
      for (let i = 0; i < results.length; i++) {
        expect(sentinelResults[i]?.name).toBe(results[i]?.name);
        expect(sentinelResults[i]?.ok).toBe(results[i]?.ok);
      }

      const sentinelLines = consoleLines.filter((line) => {
        const first = line.args[0];
        return typeof first === "string" && first.startsWith(SENTINEL_PREFIX);
      });
      expect(sentinelLines.length).toBe(results.length);

      // The non-sentinel "hello from browser" log proves regular console capture
      // coexists with the sentinel channel.
      const helloLine = consoleLines.find(
        (line) => line.type === "log" && line.args[0] === "hello from browser",
      );
      expect(helloLine).toBeDefined();
    },
    TEST_TIMEOUT_MS,
  );
});
