"use browser";

import { expect, test } from "bun:test";

test("real DOM is available inside the browser", () => {
	document.body.innerHTML = "<h1>hi</h1>";
	expect(document.querySelector("h1")?.textContent).toBe("hi");
});

test("layout is real", () => {
	const div = document.createElement("div");
	div.style.width = "50px";
	div.style.height = "20px";
	document.body.appendChild(div);
	const rect = div.getBoundingClientRect();
	expect(rect.width).toBe(50);
	expect(rect.height).toBe(20);
});
