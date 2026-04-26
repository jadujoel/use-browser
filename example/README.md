# Example

Three test files showing the two execution modes side by side.

## Files

- [counter.test.ts](./counter.test.ts) — `"use browser"`. DOM, event listeners, real CSS layout.
- [dom-api.test.ts](./dom-api.test.ts) — `"use browser"`. Platform APIs: `URL`, `FormData`, `requestAnimationFrame`.
- [host.test.ts](./host.test.ts) — no directive. Runs on the Bun host (no `document`).

## Run

From the repo root:

```sh
bun run example
```

Equivalent to `bun test example/`. The `[test] preload` entry in `bunfig.toml` auto-loads the directive plugin.

## How it works

`bunfig.toml` registers `src/phase3/preload.ts` as a `bun test` preload. The preload installs a `Bun.plugin` `onLoad` hook on test files. When a file's first non-comment statement is `"use browser"`, the plugin replaces it with a single host-side test that:

1. Bundles the original file with the `bun:test` shim (`src/phase2/`) targeting the browser.
2. Spawns a `Bun.WebView` (WebKit on macOS, Chromium elsewhere).
3. Runs the bundle inside the page and ferries the results back to the host.

Files without the directive pass through untouched and run on the host.
