"use browser";

import { expect, test } from "bun:test";

test("URL constructor is the real platform API", () => {
	const url = new URL("/path?q=hi", "https://example.com");
	expect(url.host).toBe("example.com");
	expect(url.searchParams.get("q")).toBe("hi");
});

test("FormData round-trips through URLSearchParams", () => {
	const form = new FormData();
	form.append("a", "1");
	form.append("b", "2");
	const params = new URLSearchParams(form as unknown as Record<string, string>);
	expect(params.toString()).toBe("a=1&b=2");
});

test("requestAnimationFrame fires", async () => {
	const ts = await new Promise<number>((resolve) => {
		requestAnimationFrame((t) => resolve(t));
	});
	expect(typeof ts).toBe("number");
});
