# use-browser

Run `bun:test` files inside a real headless browser by adding a single directive to the top of the file.

## Quick start

### 1. Install

```sh
bun install use-browser
```

### 2. Add the preload to `bunfig.toml`

Create (or update) `bunfig.toml` at the root of your project:

```toml
[test]
preload = ["use-browser/preload"]
```

This registers a `Bun.plugin` hook that rewrites any test file starting with `"use browser"` so it runs in a `Bun.WebView` (WebKit on macOS, Chromium elsewhere). Files without the directive are untouched and run on the host as usual.

### 3. Add `"use browser"` to a test file

```ts
// counter.test.ts
"use browser";

import { describe, expect, test } from "bun:test";

describe("counter widget", () => {
  test("increments when clicked", () => {
    document.body.innerHTML = `<button id="counter">0</button>`;
    const button = document.querySelector<HTMLButtonElement>("#counter")!;
    let count = 0;
    button.addEventListener("click", () => {
      count++;
      button.textContent = String(count);
    });

    button.click();
    button.click();

    expect(button.textContent).toBe("2");
  });
});
```

### 4. Run your tests

```sh
bun test
```

That's it — `document`, `window`, CSSOM, `requestAnimationFrame`, and the rest of the platform are real. `describe` / `test` / `expect` / hooks all work exactly as they do under `bun:test`.

## More examples

See [example/](./example/) for a counter test, a DOM/platform-API test, a Web Audio test, and a host-side test sitting side by side.

## Environment variables

All knobs are read from `process.env` on the host side. Set them when invoking
`bun test`:

| Variable | Default | Description |
|---|---|---|
| `BTR_FORWARD_CONSOLE` | _off_ | When `1` or `true`, browser-side `console.*` output is piped to the host process so logs show up in `bun test`. Internal `__BTR__:` sentinel lines are filtered out. |
| `BTR_POOL_SIZE` | `1` | Maximum number of `Bun.WebView` instances kept warm across files. Increasing trades memory for parallelism — the pool is reused across leases for per-file isolation via fresh navigations. |
| `BTR_BACKEND` | `webkit` on macOS, `chrome` elsewhere | Force a specific backend (`webkit` or `chrome`). |
| `BTR_CONSOLE_DEPTH` | `3` | Max nesting depth used when the in-browser console patch snapshots host objects (AudioContext, DOM nodes, …) for forwarded `console.*` output. |

## Programmatic API

### `useBrowser()` — run a function in a real browser

For driving a browser from a regular script (not a test file), `useBrowser`
ships a self-contained function into a `Bun.WebView` and returns its result
to the host:

```ts
import { useBrowser } from "use-browser";

const result = await useBrowser({
  main: async () => {
    const ctx = new AudioContext({ sampleRate: 48_000 });
    const osc = ctx.createOscillator();
    osc.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 1);
    return { sampleRate: ctx.sampleRate };
  },
});
```

Closure variables are **not** captured — `main` is serialized via
`Function#toString` and re-evaluated inside the page. Pass anything it needs
through `parameters`:

```ts
await useBrowser({
  main: async (opts: { read: (p: string) => Promise<string> }) => {
    const txt = await opts.read("README.md");
    document.body.textContent = txt;
    return txt.length;
  },
  parameters: [
    { read: async (p: string) => await Bun.file(p).text() },
  ],
});
```

Boundary encoding:

- JSON-safe values pass through unchanged.
- **Functions** become callable proxies inside the browser — invoking them
  round-trips back to the host, where the original function runs (async is
  awaited) and its return value is shipped back.
- **`Uint8Array` / `Buffer` / `ArrayBuffer`** cross as base64 and are
  reconstituted as `Uint8Array` on the other side.
- Cyclic graphs are not supported.

Options:

| Option | Default | Description |
|---|---|---|
| `main` | _required_ | Self-contained function evaluated inside the page. |
| `parameters` | `[]` | Arguments passed to `main`. Encoded as described above. |
| `backend` | `webkit` on macOS, `chrome` elsewhere | Force a specific backend. |
| `forwardConsole` | `true` | Pipe browser-side `console.*` to the host. |

See [example.ts](./example.ts) for a fuller walk-through (oscillator playback
plus host-side `Bun.file` read/write callbacks).

### Driving the test runner directly

For tooling that wants to drive the test runner instead of using the preload:

```ts
import {
  WebViewDriver,
  runUserFileWithDriver,
  resultToError,
} from "use-browser";

const driver = WebViewDriver.from({ maxSize: 2 });
const { results } = await runUserFileWithDriver({
  userFile: "/abs/path/to/some.test.ts",
  driver,
});
driver.close();
```
