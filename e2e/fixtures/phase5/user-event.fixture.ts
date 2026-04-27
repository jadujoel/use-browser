"use browser";

import { expect, test } from "bun:test";
import { page, userEvent } from "use-browser/context";

test("userEvent.click fires the expected event chain", async () => {
	document.body.innerHTML = `<button id="b">0</button>`;
	const button = document.querySelector<HTMLButtonElement>("#b");
	if (button === null) throw new Error("missing #b");
	const seen: string[] = [];
	for (const type of [
		"pointerdown",
		"mousedown",
		"pointerup",
		"mouseup",
		"click",
	]) {
		button.addEventListener(type, () => seen.push(type));
	}
	await userEvent.click("#b");
	expect(seen).toEqual([
		"pointerdown",
		"mousedown",
		"pointerup",
		"mouseup",
		"click",
		"click", // .click() fallback also fires
	]);
});

test("userEvent.type appends each character and fires keydown/input/keyup", async () => {
	document.body.innerHTML = `<input id="t" />`;
	const input = document.querySelector<HTMLInputElement>("#t");
	if (input === null) throw new Error("missing #t");
	const seen: string[] = [];
	input.addEventListener("keydown", (e) => seen.push(`keydown:${e.key}`));
	input.addEventListener("input", () => seen.push(`input:${input.value}`));
	input.addEventListener("keyup", (e) => seen.push(`keyup:${e.key}`));

	await userEvent.type("#t", "hi");

	expect(input.value).toBe("hi");
	expect(seen).toEqual([
		"keydown:h",
		"input:h",
		"keyup:h",
		"keydown:i",
		"input:hi",
		"keyup:i",
	]);
});

test("userEvent.clear empties an input and dispatches input event", async () => {
	document.body.innerHTML = `<input id="t" value="seed" />`;
	const input = document.querySelector<HTMLInputElement>("#t");
	if (input === null) throw new Error("missing #t");
	let inputs = 0;
	input.addEventListener("input", () => {
		inputs++;
	});
	await userEvent.clear("#t");
	expect(input.value).toBe("");
	expect(inputs).toBe(1);
});

test("page.waitFor resolves once the matching element appears", async () => {
	document.body.innerHTML = "";
	setTimeout(() => {
		const el = document.createElement("span");
		el.id = "late";
		document.body.appendChild(el);
	}, 30);

	const found = await page.waitFor("#late", { timeoutMs: 500 });
	expect(found).toBeDefined();
	expect((found as HTMLElement).id).toBe("late");
});

test("page.evaluate runs the function in the page", async () => {
	const value = await page.evaluate(() => 1 + 2);
	expect(value).toBe(3);
});
