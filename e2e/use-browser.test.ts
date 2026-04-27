import { describe, expect, test } from "bun:test";
import { useBrowser } from "../index";

const TEST_TIMEOUT_MS = 30_000;

describe("useBrowser — programmatic API", () => {
	test(
		"runs main inside the WebView and returns its result",
		async () => {
			const result = await useBrowser({
				main: () => 1 + 2,
			});
			expect(result).toBe(3);
		},
		TEST_TIMEOUT_MS,
	);

	test(
		"awaits async main and returns the resolved value",
		async () => {
			const result = await useBrowser({
				main: async (): Promise<string> => {
					await new Promise((resolve) => setTimeout(resolve, 10));
					return typeof navigator !== "undefined" ? "browser" : "unknown";
				},
			});
			expect(result).toBe("browser");
		},
		TEST_TIMEOUT_MS,
	);

	test(
		"forwards parameters across the host/browser boundary",
		async () => {
			const result = await useBrowser({
				main: (a: number, b: number, label: string): string =>
					`${label}:${a + b}`,
				parameters: [2, 3, "sum"] as const,
			});
			expect(result).toBe("sum:5");
		},
		TEST_TIMEOUT_MS,
	);

	test(
		"exposes real browser globals (AudioContext)",
		async () => {
			const result = await useBrowser({
				main: (): string => {
					const ctx = new AudioContext();
					return typeof ctx.currentTime === "number" ? "ok" : "missing";
				},
			});
			expect(result).toBe("ok");
		},
		TEST_TIMEOUT_MS,
	);

	test(
		"propagates errors thrown inside main",
		async () => {
			await expect(
				useBrowser({
					main: (): never => {
						throw new Error("boom from browser");
					},
				}),
			).rejects.toThrow(/boom from browser/);
		},
		TEST_TIMEOUT_MS,
	);
});
