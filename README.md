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

See [example/](./example/) for a counter test, a DOM/platform-API test, and a host-side test sitting side by side.
