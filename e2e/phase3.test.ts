import { describe, expect, test } from "bun:test";

const TEST_TIMEOUT_MS = 60_000;

const PRELOAD_PATH = new URL(
  "../src/phase3/preload.ts",
  import.meta.url,
).pathname;

const fixturePath = (name: string): string =>
  new URL(`./fixtures/phase3/${name}`, import.meta.url).pathname;

interface SpawnResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly combined: string;
  readonly exitCode: number;
}

const runBunTest = async (fixture: string): Promise<SpawnResult> => {
  const proc = Bun.spawn({
    cmd: ["bun", "test", "--preload", PRELOAD_PATH, fixturePath(fixture)],
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { stdout, stderr, combined: stdout + stderr, exitCode };
};

describe("phase 3 — directive detection & test rewriting", () => {
  test(
    "files with 'use browser' run in WebView and pass under bun test",
    async () => {
      const result = await runBunTest("use-browser-passing.fixture.ts");
      if (result.exitCode !== 0) {
        throw new Error(`expected exit 0, got ${result.exitCode}\n${result.combined}`);
      }
      expect(result.combined).toContain("1 pass");
      expect(result.combined).toContain("0 fail");
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "files with 'use browser' surface child failures through the host test",
    async () => {
      const result = await runBunTest("use-browser-failing.fixture.ts");
      expect(result.exitCode).not.toBe(0);
      expect(result.combined).toContain("Browser tests failed");
      expect(result.combined).toContain("intentional fail");
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "files without the directive pass through and run on the host",
    async () => {
      const result = await runBunTest("no-directive.fixture.ts");
      if (result.exitCode !== 0) {
        throw new Error(`expected exit 0, got ${result.exitCode}\n${result.combined}`);
      }
      expect(result.combined).toContain("1 pass");
    },
    TEST_TIMEOUT_MS,
  );
});

describe("phase 3 — directive parser unit checks", () => {
  test("recognizes the directive", async () => {
    const { hasUseBrowserDirective } = await import("../src/phase3/detect-directive");
    expect(hasUseBrowserDirective(`"use browser";\nconst x = 1;`)).toBe(true);
    expect(hasUseBrowserDirective(`'use browser';`)).toBe(true);
    expect(hasUseBrowserDirective(`// leading comment\n"use browser";`)).toBe(true);
    expect(hasUseBrowserDirective(`/* block */\n"use browser";`)).toBe(true);
    expect(hasUseBrowserDirective(`\n\n"use browser";`)).toBe(true);
    expect(hasUseBrowserDirective(`#!/usr/bin/env bun\n"use browser";`)).toBe(true);
  });

  test("rejects when not at top", async () => {
    const { hasUseBrowserDirective } = await import("../src/phase3/detect-directive");
    expect(hasUseBrowserDirective(`const x = 1;\n"use browser";`)).toBe(false);
    expect(hasUseBrowserDirective(`"use strict";\n"use browser";`)).toBe(false);
    expect(hasUseBrowserDirective(``)).toBe(false);
    expect(hasUseBrowserDirective(`// "use browser"`)).toBe(false);
  });
});
