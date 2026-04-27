/**
 * Page-side test helpers — `userEvent` for synthetic DOM input and `page` for
 * miscellaneous test orchestration.
 *
 * v1 dispatches real DOM events from inside the page. They bubble, React /
 * Vue / Solid handlers respond to them, and they're enough for the vast
 * majority of component tests. They do *not* have `isTrusted: true` — to get
 * those, the test would need to round-trip to the host's `view.click()` /
 * `view.type()` methods. That's deferred until the runner exposes a host RPC
 * channel that doesn't conflict with the in-flight `view.evaluate()` running
 * the test itself.
 */

const queryOrThrow = (selector: string): Element => {
	const el = document.querySelector(selector);
	if (el === null) {
		throw new Error(
			`userEvent: no element matched ${JSON.stringify(selector)}`,
		);
	}
	return el;
};

const dispatchMouse = (target: Element, type: string): void => {
	target.dispatchEvent(
		new MouseEvent(type, {
			bubbles: true,
			cancelable: true,
			view: window,
			button: 0,
		}),
	);
};

const dispatchKey = (
	target: EventTarget,
	type: "keydown" | "keyup",
	key: string,
): void => {
	target.dispatchEvent(
		new KeyboardEvent(type, { key, bubbles: true, cancelable: true }),
	);
};

const isTextField = (
	el: Element,
): el is HTMLInputElement | HTMLTextAreaElement =>
	el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;

export interface UserEvent {
	/** Dispatch a synthetic click chain (`pointerdown`/`mousedown`/`pointerup`/`mouseup`/`click`) on the matched element. */
	click(selector: string): Promise<void>;
	/** Focus the matched element and dispatch `keydown`/`input`/`keyup` for each character of `text`. */
	type(selector: string, text: string): Promise<void>;
	/** Press a single key on the active element (or `<body>` if none). */
	press(key: string): Promise<void>;
	/** Clear the value of the matched `<input>`/`<textarea>`. */
	clear(selector: string): Promise<void>;
}

export const userEvent: UserEvent = {
	click: async (selector) => {
		const el = queryOrThrow(selector);
		dispatchMouse(el, "pointerdown");
		dispatchMouse(el, "mousedown");
		dispatchMouse(el, "pointerup");
		dispatchMouse(el, "mouseup");
		dispatchMouse(el, "click");
		if (el instanceof HTMLElement) el.click();
	},

	type: async (selector, text) => {
		const el = queryOrThrow(selector);
		if (el instanceof HTMLElement) el.focus();
		const writable = isTextField(el);
		for (const ch of text) {
			dispatchKey(el, "keydown", ch);
			if (writable) {
				el.value += ch;
				el.dispatchEvent(
					new InputEvent("input", {
						bubbles: true,
						data: ch,
						inputType: "insertText",
					}),
				);
			}
			dispatchKey(el, "keyup", ch);
		}
	},

	press: async (key) => {
		const target: EventTarget = document.activeElement ?? document.body;
		dispatchKey(target, "keydown", key);
		dispatchKey(target, "keyup", key);
	},

	clear: async (selector) => {
		const el = queryOrThrow(selector);
		if (!isTextField(el)) return;
		el.value = "";
		el.dispatchEvent(
			new InputEvent("input", {
				bubbles: true,
				data: null,
				inputType: "deleteContentBackward",
			}),
		);
	},
};

export interface PageWaitForOptions {
	readonly timeoutMs?: number;
}

export interface Page {
	/** Run the function inside the page; really just `fn()`. Provided for parity with Playwright-style APIs. */
	evaluate<T>(fn: () => T | Promise<T>): Promise<T>;
	/** Resolve once `selector` matches an element, or reject after `timeoutMs` (default 5s). */
	waitFor(selector: string, options?: PageWaitForOptions): Promise<Element>;
	/** Pause for `ms` milliseconds — useful for sleeping past async UI work. */
	sleep(ms: number): Promise<void>;
}

const DEFAULT_WAIT_TIMEOUT_MS = 5_000;

export const page: Page = {
	evaluate: async (fn) => fn(),

	waitFor: (selector, options) => {
		const timeoutMs = options?.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
		const start = performance.now();
		return new Promise<Element>((resolve, reject) => {
			const tick = (): void => {
				const found = document.querySelector(selector);
				if (found !== null) {
					resolve(found);
					return;
				}
				if (performance.now() - start > timeoutMs) {
					reject(
						new Error(
							`page.waitFor: timed out after ${timeoutMs}ms waiting for ${JSON.stringify(selector)}`,
						),
					);
					return;
				}
				requestAnimationFrame(tick);
			};
			tick();
		});
	},

	sleep: (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
};
