import { type Backend, type ConsoleHandler, WebViewDriver } from "./driver";

/**
 * Options for the programmatic `useBrowser` API.
 *
 * `main` is a self-contained function that runs inside a real browser
 * context. Closure variables from the host process are NOT captured — the
 * function is converted to source via `Function#toString` and evaluated
 * fresh inside the WebView. The function may, however, freely reference
 * values passed via `parameters`.
 *
 * `parameters` cross the host/browser boundary with the following encoding:
 * - JSON-safe values pass through unchanged.
 * - Functions become callable proxies inside the browser; invoking them
 *   round-trips back to the host, where the original function runs and its
 *   return value is shipped back. `async` host functions are awaited.
 * - `Uint8Array` / `Buffer` / `ArrayBuffer` are transferred as base64 and
 *   reconstituted as `Uint8Array` on the other side.
 *
 * Cyclic graphs are not supported.
 */
export interface UseBrowserOptions<TArgs extends readonly unknown[], TResult> {
	readonly backend?: Backend;
	readonly main: (...args: TArgs) => TResult | Promise<TResult>;
	readonly parameters?: TArgs;
	/**
	 * Forward browser-side `console.*` calls to the host process. Defaults
	 * to `true` so users can `console.log` from inside `main` and see output
	 * in their terminal without extra plumbing.
	 */
	readonly forwardConsole?: boolean;
}

const resolveBackend = (backend: Backend | undefined): Backend =>
	backend ?? (process.platform === "darwin" ? "webkit" : "chrome");

const forwardConsoleArgs: ConsoleHandler = (type, ...args) => {
	const target = (
		console as unknown as Record<
			string,
			((...a: unknown[]) => void) | undefined
		>
	)[type];
	if (typeof target === "function") {
		target(...args);
		return;
	}
	console.log(...args);
};

// ---------------------------------------------------------------------------
// Boundary encoding (host side)
//
// Values are walked recursively. Functions are replaced with FnRef placeholders
// that the page upgrades into proxy functions. Uint8Array / Buffer /
// ArrayBuffer are transferred as base64 BytesRefs.
// ---------------------------------------------------------------------------

interface FnRef {
	readonly __ub_fn: true;
	readonly __ub_id: number;
}
interface BytesRef {
	readonly __ub_bytes: true;
	readonly b64: string;
}

const isBytesRef = (v: unknown): v is BytesRef =>
	typeof v === "object" &&
	v !== null &&
	(v as { __ub_bytes?: unknown }).__ub_bytes === true &&
	typeof (v as { b64?: unknown }).b64 === "string";

const isUint8Array = (v: unknown): v is Uint8Array => v instanceof Uint8Array;
const isArrayBuffer = (v: unknown): v is ArrayBuffer =>
	v instanceof ArrayBuffer;

const bytesToBase64 = (bytes: Uint8Array): string =>
	Buffer.from(bytes).toString("base64");

const base64ToBytes = (b64: string): Uint8Array =>
	new Uint8Array(Buffer.from(b64, "base64"));

type HostFn = (...args: readonly unknown[]) => unknown;

const encodeForBrowser = (
	value: unknown,
	registry: Map<number, HostFn>,
	nextId: { n: number },
): unknown => {
	if (value === null || value === undefined) return value;
	const t = typeof value;
	if (t === "string" || t === "number" || t === "boolean") return value;
	if (t === "function") {
		const id = nextId.n++;
		registry.set(id, value as HostFn);
		const ref: FnRef = { __ub_fn: true, __ub_id: id };
		return ref;
	}
	if (isUint8Array(value)) {
		const ref: BytesRef = { __ub_bytes: true, b64: bytesToBase64(value) };
		return ref;
	}
	if (isArrayBuffer(value)) {
		const ref: BytesRef = {
			__ub_bytes: true,
			b64: bytesToBase64(new Uint8Array(value)),
		};
		return ref;
	}
	if (Array.isArray(value)) {
		return value.map((v) => encodeForBrowser(v, registry, nextId));
	}
	if (t === "object") {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
			out[k] = encodeForBrowser(v, registry, nextId);
		}
		return out;
	}
	// bigint / symbol — let JSON.stringify throw a clear error.
	return value;
};

const decodeFromBrowser = (value: unknown): unknown => {
	if (value === null || typeof value !== "object") return value;
	if (isBytesRef(value)) return base64ToBytes(value.b64);
	if (Array.isArray(value)) return value.map(decodeFromBrowser);
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
		out[k] = decodeFromBrowser(v);
	}
	return out;
};

// ---------------------------------------------------------------------------
// Browser-side bootstrap
//
// `Bun.WebView` serializes evaluate() calls — only one can be in flight at a
// time. So we cannot ship RPC responses through evaluate() while main is
// awaiting one. Instead, main is started fire-and-forget, and the host drives
// a poll loop: each `__ub.poll()` returns either the next pending RPC, the
// final result/error, or an "idle" tick. RPC responses are written by the
// next poll evaluate (resolveRpc) which then immediately suspends on the
// next poll promise — keeping at most one evaluate pending at any moment.
// ---------------------------------------------------------------------------

const POLL_IDLE_TIMEOUT_MS = 1000;

const browserBootstrapSource = (): string => `
(function () {
	var rpcPending = new Map();
	var rpcNextId = 1;
	var outbox = [];
	var done = false;
	var result = undefined;
	var error = undefined;
	var pollWaiter = null;

	function b64encode(bytes) {
		var s = '';
		var chunk = 0x8000;
		for (var i = 0; i < bytes.length; i += chunk) {
			s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
		}
		return btoa(s);
	}
	function b64decode(b64) {
		var s = atob(b64);
		var arr = new Uint8Array(s.length);
		for (var i = 0; i < s.length; i++) arr[i] = s.charCodeAt(i);
		return arr;
	}
	function encode(v) {
		if (v === null || v === undefined) return v;
		var t = typeof v;
		if (t === 'string' || t === 'number' || t === 'boolean') return v;
		if (t === 'function') return undefined;
		if (v instanceof Uint8Array) return { __ub_bytes: true, b64: b64encode(v) };
		if (v instanceof ArrayBuffer) return { __ub_bytes: true, b64: b64encode(new Uint8Array(v)) };
		if (Array.isArray(v)) return v.map(encode);
		if (t === 'object') {
			var out = {};
			for (var k in v) {
				if (Object.prototype.hasOwnProperty.call(v, k)) out[k] = encode(v[k]);
			}
			return out;
		}
		return v;
	}
	function decode(v) {
		if (v === null || typeof v !== 'object') return v;
		if (v.__ub_bytes === true && typeof v.b64 === 'string') return b64decode(v.b64);
		if (v.__ub_fn === true && typeof v.__ub_id === 'number') {
			var fnId = v.__ub_id;
			return function () {
				var args = Array.prototype.slice.call(arguments).map(encode);
				return invokeRpc(fnId, args);
			};
		}
		if (Array.isArray(v)) return v.map(decode);
		var out = {};
		for (var k in v) {
			if (Object.prototype.hasOwnProperty.call(v, k)) out[k] = decode(v[k]);
		}
		return out;
	}
	function makeError(payload) {
		var e = new Error((payload && payload.message) || 'host error');
		if (payload && payload.name) e.name = payload.name;
		if (payload && payload.stack) e.stack = payload.stack;
		return e;
	}
	function notifyPoll() {
		if (pollWaiter !== null) pollWaiter();
	}
	function invokeRpc(fnId, args) {
		var id = rpcNextId++;
		var p = new Promise(function (res, rej) {
			rpcPending.set(id, { res: res, rej: rej });
		});
		outbox.push({ id: id, fnId: fnId, args: args });
		notifyPoll();
		return p;
	}
	function takeEvent() {
		if (outbox.length > 0) {
			return { kind: 'rpc', request: outbox.shift() };
		}
		if (done) {
			if (error !== undefined) return { kind: 'error', error: error };
			return { kind: 'done', result: result };
		}
		return null;
	}
	function poll() {
		return new Promise(function (resolve) {
			var settled = false;
			function flush() {
				if (settled) return false;
				var ev = takeEvent();
				if (ev !== null) {
					settled = true;
					pollWaiter = null;
					resolve(ev);
					return true;
				}
				return false;
			}
			if (flush()) return;
			pollWaiter = flush;
			setTimeout(function () {
				if (settled) return;
				settled = true;
				pollWaiter = null;
				resolve({ kind: 'idle' });
			}, ${POLL_IDLE_TIMEOUT_MS});
		});
	}
	function resolveRpc(id, kind, payload) {
		var entry = rpcPending.get(id);
		if (!entry) return;
		rpcPending.delete(id);
		if (kind === 'ok') {
			try { entry.res(decode(payload)); }
			catch (e) { entry.rej(e); }
		} else {
			entry.rej(makeError(payload));
		}
	}
	function kickoff(encodedArgs, mainSrc) {
		// Fire-and-forget: must return synchronously so the evaluate() that
		// triggers kickoff resolves immediately. The async main runs on the
		// microtask queue; its completion is observed via subsequent poll()s.
		Promise.resolve().then(function () {
			var args = decode(encodedArgs);
			var fn;
			try { fn = (0, eval)('(' + mainSrc + ')'); }
			catch (e) {
				error = { name: e.name || 'Error', message: e.message || String(e), stack: e.stack };
				done = true;
				notifyPoll();
				return;
			}
			Promise.resolve().then(function () {
				return fn.apply(null, args);
			}).then(function (r) {
				result = encode(r);
				done = true;
				notifyPoll();
			}, function (e) {
				error = { name: (e && e.name) || 'Error', message: (e && e.message) || String(e), stack: e && e.stack };
				done = true;
				notifyPoll();
			});
		});
	}
	window.__ub = {
		kickoff: kickoff,
		poll: poll,
		resolveRpc: resolveRpc,
	};
})();
`;

const buildPage = (): string =>
	[
		"<!doctype html>",
		'<html><head><meta charset="utf-8"><title>use-browser</title></head>',
		"<body>",
		"<script>",
		browserBootstrapSource(),
		"</script>",
		"</body></html>",
	].join("\n");

// ---------------------------------------------------------------------------
// Host-side RPC dispatcher
// ---------------------------------------------------------------------------

interface RpcRequest {
	readonly id: number;
	readonly fnId: number;
	readonly args: readonly unknown[];
}

interface PollDone {
	readonly kind: "done";
	readonly result: unknown;
}
interface PollError {
	readonly kind: "error";
	readonly error: { name?: string; message?: string; stack?: string };
}
interface PollRpc {
	readonly kind: "rpc";
	readonly request: RpcRequest;
}
interface PollIdle {
	readonly kind: "idle";
}
type PollEvent = PollDone | PollError | PollRpc | PollIdle;

const isPollEvent = (v: unknown): v is PollEvent =>
	typeof v === "object" &&
	v !== null &&
	typeof (v as { kind?: unknown }).kind === "string";

// view.evaluate takes a JS source string. JSON.parse(<JSON-string-literal>)
// avoids any quoting subtleties around embedding payloads in the source.
const asEvaluateLiteral = (json: string): string =>
	`JSON.parse(${JSON.stringify(json)})`;

const runHostFn = async (
	registry: Map<number, HostFn>,
	nextId: { n: number },
	req: RpcRequest,
): Promise<{
	readonly kind: "ok" | "err";
	readonly payloadJson: string;
}> => {
	const fn = registry.get(req.fnId);
	if (fn === undefined) {
		return {
			kind: "err",
			payloadJson: JSON.stringify({
				name: "Error",
				message: `useBrowser: unknown host function id ${req.fnId}`,
			}),
		};
	}
	try {
		const decoded = req.args.map(decodeFromBrowser) as readonly unknown[];
		const out = await fn(...decoded);
		const encoded = encodeForBrowser(out, registry, nextId);
		return { kind: "ok", payloadJson: JSON.stringify(encoded ?? null) };
	} catch (err) {
		const e = err instanceof Error ? err : new Error(String(err));
		return {
			kind: "err",
			payloadJson: JSON.stringify({
				name: e.name,
				message: e.message,
				stack: e.stack,
			}),
		};
	}
};

const errorFromBrowser = (err: PollError["error"]): Error => {
	const e = new Error(err.message ?? "browser error");
	if (err.name !== undefined) e.name = err.name;
	if (err.stack !== undefined) e.stack = err.stack;
	return e;
};

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Run `main` inside a real browser (WebKit on macOS, Chrome elsewhere) and
 * return its result to the host.
 *
 * The function source is bundled into the page verbatim — keep it
 * self-contained. Pass any host-side data the function needs through
 * `parameters`; functions in `parameters` become callable proxies inside
 * the browser that round-trip back to the host. `Uint8Array` / `Buffer`
 * data crosses the boundary as base64 and is reconstituted as
 * `Uint8Array` on the other side.
 *
 * @throws {Error} if the WebView cannot navigate, the function throws, or
 *   the returned value is not structured-clone serializable.
 */
export const useBrowser = async <TArgs extends readonly unknown[], TResult>(
	options: UseBrowserOptions<TArgs, TResult>,
): Promise<TResult> => {
	const driver = WebViewDriver.from({
		backend: resolveBackend(options.backend),
		maxSize: 1,
	});
	const lease = await driver.acquire();
	const registry = new Map<number, HostFn>();
	const nextId = { n: 1 };
	try {
		if (options.forwardConsole !== false) {
			lease.setConsoleHandler(forwardConsoleArgs);
		}
		const page = buildPage();
		const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(page)}`;
		await lease.view.navigate(dataUrl);

		const encodedArgs = encodeForBrowser(
			options.parameters ?? [],
			registry,
			nextId,
		);
		const argsLit = asEvaluateLiteral(JSON.stringify(encodedArgs));
		const mainSrcLit = JSON.stringify(options.main.toString());
		// Fire-and-forget: kickoff returns void synchronously, so this
		// evaluate resolves immediately and frees the WebView for poll()s.
		await lease.view.evaluate(`window.__ub.kickoff(${argsLit}, ${mainSrcLit})`);

		// Drive the page through the RPC loop. Each iteration issues exactly
		// one evaluate() so we never violate the WebView's "one pending
		// evaluate at a time" rule.
		while (true) {
			const event = (await lease.view.evaluate(
				"window.__ub.poll()",
			)) as unknown;
			if (!isPollEvent(event)) {
				throw new Error("useBrowser: unexpected poll() shape from page");
			}
			if (event.kind === "idle") continue;
			if (event.kind === "done") {
				return decodeFromBrowser(event.result) as TResult;
			}
			if (event.kind === "error") {
				throw errorFromBrowser(event.error);
			}
			// kind === 'rpc'
			const reply = await runHostFn(registry, nextId, event.request);
			await lease.view.evaluate(
				`window.__ub.resolveRpc(${event.request.id}, ${JSON.stringify(reply.kind)}, ${asEvaluateLiteral(reply.payloadJson)})`,
			);
		}
	} finally {
		lease.release();
		driver.close();
	}
};
