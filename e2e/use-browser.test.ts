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

	test(
		"calls a host function passed in parameters and awaits its result",
		async () => {
			const calls: string[] = [];
			const greet = async (name: string): Promise<string> => {
				calls.push(name);
				await new Promise((resolve) => setTimeout(resolve, 10));
				return `hello ${name}`;
			};
			const result = await useBrowser({
				main: async (api: { greet: (n: string) => Promise<string> }) => {
					const a = await api.greet("alice");
					const b = await api.greet("bob");
					return [a, b];
				},
				parameters: [{ greet }] as const,
			});
			expect(result).toEqual(["hello alice", "hello bob"]);
			expect(calls).toEqual(["alice", "bob"]);
		},
		TEST_TIMEOUT_MS,
	);

	test(
		"propagates errors thrown by host functions back into the browser",
		async () => {
			const fail = (): never => {
				throw new Error("host side failure");
			};
			await expect(
				useBrowser({
					main: async (api: { fail: () => Promise<never> }) => {
						try {
							await api.fail();
							return "no-throw";
						} catch (e) {
							return e instanceof Error ? e.message : String(e);
						}
					},
					parameters: [{ fail }] as const,
				}),
			).resolves.toBe("host side failure");
		},
		TEST_TIMEOUT_MS,
	);

	test(
		"transfers Uint8Array bytes in both directions",
		async () => {
			const input = new Uint8Array([1, 2, 3, 4, 250]);
			const result = await useBrowser({
				main: async (bytes: Uint8Array): Promise<Uint8Array> => {
					const out = new Uint8Array(bytes.length);
					for (let i = 0; i < bytes.length; i++)
						out[i] = (bytes[i] ?? 0) ^ 0xff;
					return out;
				},
				parameters: [input] as const,
			});
			expect(result).toBeInstanceOf(Uint8Array);
			expect(Array.from(result)).toEqual([254, 253, 252, 251, 5]);
		},
		TEST_TIMEOUT_MS,
	);

	test(
		"file-system style RPC: read + write through host functions",
		async () => {
			const fs = new Map<string, Uint8Array>();
			fs.set("hello.txt", new TextEncoder().encode("world"));
			interface FsApi {
				readonly read: (path: string) => Promise<Uint8Array>;
				readonly write: (path: string, content: Uint8Array) => Promise<void>;
			}
			const api: FsApi = {
				read: async (path) => {
					const v = fs.get(path);
					if (v === undefined) throw new Error(`ENOENT: ${path}`);
					return v;
				},
				write: async (path, content) => {
					fs.set(path, content);
				},
			};
			const echoed = await useBrowser({
				main: async (a: FsApi): Promise<string> => {
					const bytes = await a.read("hello.txt");
					const text = new TextDecoder().decode(bytes);
					await a.write("greeting.txt", new TextEncoder().encode(`hi ${text}`));
					return text;
				},
				parameters: [api] as const,
			});
			expect(echoed).toBe("world");
			const written = fs.get("greeting.txt");
			expect(written).toBeDefined();
			expect(new TextDecoder().decode(written ?? new Uint8Array())).toBe(
				"hi world",
			);
		},
		TEST_TIMEOUT_MS,
	);
});
