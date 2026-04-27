"use browser";

// Add `"use browser";` as the first statement of the file and the entire suite
// is hoisted into a real headless browser (WebKit on macOS, Chromium elsewhere).
// The rest of the file is plain `bun:test` — describe / test / expect / hooks
// all work, and `document` / `window` / CSSOM are real.

import { afterEach, describe, expect, test } from "bun:test";

describe("counter widget", () => {
	afterEach(() => {
		document.body.innerHTML = "";
	});

	test("renders the initial count", () => {
		document.body.innerHTML = `<button id="counter">0</button>`;
		const button = document.querySelector<HTMLButtonElement>("#counter");
		expect(button?.textContent).toBe("0");
	});

	test("increments when clicked (real layout, real event listener)", () => {
		document.body.innerHTML = `<button id="counter" style="padding:8px 16px">0</button>`;
		const button = document.querySelector<HTMLButtonElement>("#counter");
		if (button === null) throw new Error("missing #counter");
		let count = 0;
		button.addEventListener("click", () => {
			count++;
			button.textContent = String(count);
		});

		button.click();
		button.click();
		button.click();

		expect(button.textContent).toBe("3");
		// CSS layout is real — padding contributes to the measured width.
		expect(button.getBoundingClientRect().width).toBeGreaterThan(20);
	});
});
