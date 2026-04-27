import { DEFAULT_CONSOLE_DEPTH } from "../constants";
import type { TestResult } from "../types";
import { SENTINEL_PREFIX } from "../types";
import { harness } from "./harness";

interface BrowserLoadErrorPayload {
	readonly message: string;
	readonly stack?: string;
	readonly name?: string;
}

interface BtrWindow {
	__btrRun?: () => Promise<TestResult[]>;
	__btrLoadError?: BrowserLoadErrorPayload;
	__btrConsoleDepth?: number;
}

const btrWindow = window as unknown as BtrWindow;

const toLoadErrorPayload = (err: unknown): BrowserLoadErrorPayload => {
	if (err instanceof Error) {
		const payload: BrowserLoadErrorPayload = {
			message: err.message,
			name: err.name,
		};
		if (err.stack !== undefined) {
			return { ...payload, stack: err.stack };
		}
		return payload;
	}
	return { message: String(err), name: "NonError" };
};

// ---------------------------------------------------------------------------
// console.* host-object snapshotting
//
// Bun.WebView's console bridge serializes each argument with an algorithm
// that, like JSON.stringify, only sees own enumerable string-keyed properties.
// Host objects (AudioContext, OscillatorNode, DOM nodes, etc.) expose all of
// their state via prototype getters, so by the time the host sees the value
// it has been flattened to `{}`.
//
// To give users the same "Chrome devtools-ish" experience they get when
// logging a host object in a real browser, we replace each console argument
// with a plain-object snapshot that includes inherited getter values, walked
// up to a small depth with cycle detection.
// ---------------------------------------------------------------------------

const SNAPSHOT_MAX_KEYS = 50;

const resolveMaxDepth = (): number => {
	const configured = btrWindow.__btrConsoleDepth;
	if (
		typeof configured === "number" &&
		Number.isFinite(configured) &&
		configured >= 0
	) {
		return Math.floor(configured);
	}
	return DEFAULT_CONSOLE_DEPTH;
};

type Snapshot =
	| string
	| number
	| boolean
	| null
	| undefined
	| { readonly [k: string]: Snapshot }
	| readonly Snapshot[];

const isPlainPrototype = (proto: object | null): boolean =>
	proto === null || proto === Object.prototype || proto === Array.prototype;

const constructorName = (value: object): string => {
	const proto = Object.getPrototypeOf(value) as {
		constructor?: { name?: string };
	} | null;
	const name = proto?.constructor?.name;
	return typeof name === "string" && name.length > 0 ? name : "Object";
};

const collectKeys = (value: object): string[] => {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const k of Object.keys(value)) {
		if (seen.has(k)) continue;
		seen.add(k);
		out.push(k);
	}
	let proto: object | null = Object.getPrototypeOf(value) as object | null;
	while (proto !== null && proto !== Object.prototype) {
		for (const k of Object.getOwnPropertyNames(proto)) {
			if (k === "constructor" || seen.has(k)) continue;
			const desc = Object.getOwnPropertyDescriptor(proto, k);
			// Only include accessor (getter) properties; skip methods/data props
			// that already came from the prototype chain to keep output focused
			// on "interesting" state.
			if (desc?.get !== undefined) {
				seen.add(k);
				out.push(k);
			}
		}
		proto = Object.getPrototypeOf(proto) as object | null;
	}
	return out;
};

const snapshotValue = (
	value: unknown,
	depth: number,
	maxDepth: number,
	seen: WeakSet<object>,
): Snapshot => {
	if (value === null) return null;
	const t = typeof value;
	if (t === "string" || t === "boolean" || t === "undefined") {
		return value as string | boolean | undefined;
	}
	if (t === "number") {
		const n = value as number;
		return Number.isFinite(n) ? n : String(n);
	}
	if (t === "bigint") return `${(value as bigint).toString()}n`;
	if (t === "symbol") return (value as symbol).toString();
	if (t === "function") {
		const name = (value as { name?: string }).name ?? "";
		return `[Function${name === "" ? "" : `: ${name}`}]`;
	}
	if (t !== "object") return String(value);

	const obj = value as object;
	if (seen.has(obj)) return "[Circular]";
	if (depth >= maxDepth) {
		return `[${constructorName(obj)}]`;
	}
	seen.add(obj);

	if (obj instanceof Error) {
		const out: Record<string, Snapshot> = {
			__class: obj.constructor.name,
			name: obj.name,
			message: obj.message,
		};
		if (obj.stack !== undefined) out.stack = obj.stack;
		return out;
	}
	if (Array.isArray(obj)) {
		return obj
			.slice(0, SNAPSHOT_MAX_KEYS)
			.map((v) => snapshotValue(v, depth + 1, maxDepth, seen));
	}

	const keys = collectKeys(obj).slice(0, SNAPSHOT_MAX_KEYS);
	const out: Record<string, Snapshot> = {};
	const proto = Object.getPrototypeOf(obj) as object | null;
	if (!isPlainPrototype(proto)) {
		out.__class = constructorName(obj);
	}
	for (const k of keys) {
		try {
			const v = (obj as Record<string, unknown>)[k];
			out[k] = snapshotValue(v, depth + 1, maxDepth, seen);
		} catch (err) {
			out[k] = `[Throws: ${err instanceof Error ? err.message : String(err)}]`;
		}
	}
	return out;
};

const snapshotForConsole = (value: unknown, maxDepth: number): Snapshot => {
	// Strings are passed through untouched so plain log lines stay readable.
	if (typeof value === "string") return value;
	return snapshotValue(value, 0, maxDepth, new WeakSet());
};

type ConsoleMethod = "log" | "info" | "warn" | "error" | "debug" | "trace";
const PATCHED_METHODS: readonly ConsoleMethod[] = [
	"log",
	"info",
	"warn",
	"error",
	"debug",
	"trace",
];

const patchConsole = (): void => {
	for (const method of PATCHED_METHODS) {
		const original = console[method] as
			| ((...args: unknown[]) => void)
			| undefined;
		if (typeof original !== "function") continue;
		console[method] = ((...args: unknown[]) => {
			const maxDepth = resolveMaxDepth();
			const mapped = args.map((a) => {
				// Sentinel lines must pass through unchanged so the host can
				// strip them from forwarded console output.
				if (typeof a === "string" && a.startsWith(SENTINEL_PREFIX)) return a;
				return snapshotForConsole(a, maxDepth);
			});
			original.apply(console, mapped);
		}) as Console[typeof method];
	}
};

patchConsole();

// ---------------------------------------------------------------------------
// User-file loading + harness entry point
// ---------------------------------------------------------------------------

// Dynamic-import the user's file so a top-level throw / SyntaxError /
// ReferenceError during the user's module evaluation is observable here.
// A top-level static `import` would fail this whole module and we'd never
// install __btrRun, leaving the host with a cryptic error.
const userFileLoaded: Promise<undefined> = import("btr:user-file").then(
	() => undefined,
	(err: unknown) => {
		btrWindow.__btrLoadError = toLoadErrorPayload(err);
		return undefined;
	},
);

const run = async (): Promise<TestResult[]> => {
	await userFileLoaded;
	const loadError = btrWindow.__btrLoadError;
	if (loadError !== undefined) {
		const err = new Error(loadError.message);
		if (loadError.name !== undefined) err.name = loadError.name;
		if (loadError.stack !== undefined) err.stack = loadError.stack;
		throw err;
	}
	const results = await harness.run();
	for (const r of results) {
		console.log(`${SENTINEL_PREFIX}${JSON.stringify(r)}`);
	}
	return results;
};

btrWindow.__btrRun = run;
