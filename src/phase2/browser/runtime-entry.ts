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
