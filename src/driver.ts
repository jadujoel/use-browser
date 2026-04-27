import { ENV } from "./constants";

export type ConsoleHandler = (type: string, ...args: unknown[]) => void;
export type Backend = "webkit" | "chrome";

export interface Lease {
	readonly view: Bun.WebView;
	setConsoleHandler(handler: ConsoleHandler | undefined): void;
	release(): void;
}

export interface WebViewDriverFromOptions {
	readonly maxSize?: number;
	readonly backend?: Backend;
}

const defaultBackend = (): Backend =>
	process.platform === "darwin" ? "webkit" : "chrome";

class PooledView {
	private currentHandler: ConsoleHandler | undefined = undefined;
	readonly view: Bun.WebView;

	private constructor(backend: Backend) {
		this.view = new Bun.WebView({
			backend,
			console: (type, ...args) => this.currentHandler?.(type, ...args),
		});
	}

	static create = (backend: Backend): PooledView => new PooledView(backend);

	setConsoleHandler = (handler: ConsoleHandler | undefined): void => {
		this.currentHandler = handler;
	};

	close = (): void => {
		this.view.close();
	};
}

/**
 * Warm pool of `Bun.WebView` instances. Cold-starting a view costs ~200ms on
 * macOS and longer for Chrome — the pool reuses idle views across files,
 * relying on a fresh navigation between leases for per-file isolation.
 *
 * The console handler on a WebView is fixed at construction, so each pooled
 * view installs a closure that delegates to a per-lease handler the lease
 * swaps in/out. That keeps console capture tied to the current lease without
 * tearing the view down.
 */
export class WebViewDriver {
	private readonly idle: PooledView[] = [];
	private readonly busy = new Set<PooledView>();
	private readonly waiting: Array<(p: PooledView) => void> = [];
	private closed = false;

	private constructor(
		private readonly maxSize: number,
		private readonly backend: Backend,
	) {}

	static from = (options: WebViewDriverFromOptions = {}): WebViewDriver =>
		new WebViewDriver(
			options.maxSize ?? 1,
			options.backend ?? defaultBackend(),
		);

	/**
	 * @throws {Error} if the driver has been closed.
	 */
	acquire = async (): Promise<Lease> => {
		if (this.closed) throw new Error("WebViewDriver is closed");
		const pooled = await this.acquirePooled();
		return {
			view: pooled.view,
			setConsoleHandler: pooled.setConsoleHandler,
			release: () => this.releasePooled(pooled),
		};
	};

	private acquirePooled = async (): Promise<PooledView> => {
		const reused = this.idle.pop();
		if (reused !== undefined) {
			this.busy.add(reused);
			return reused;
		}
		if (this.busy.size + this.idle.length < this.maxSize) {
			const fresh = PooledView.create(this.backend);
			this.busy.add(fresh);
			return fresh;
		}
		return new Promise<PooledView>((resolve) => {
			this.waiting.push((p) => {
				this.busy.add(p);
				resolve(p);
			});
		});
	};

	private releasePooled = (p: PooledView): void => {
		p.setConsoleHandler(undefined);
		this.busy.delete(p);
		if (this.closed) {
			p.close();
			return;
		}
		const next = this.waiting.shift();
		if (next !== undefined) {
			next(p);
			return;
		}
		this.idle.push(p);
	};

	close = (): void => {
		this.closed = true;
		for (const p of this.idle) p.close();
		this.idle.length = 0;
		for (const p of this.busy) p.close();
		this.busy.clear();
	};

	stats = (): {
		readonly idle: number;
		readonly busy: number;
		readonly maxSize: number;
	} => ({
		idle: this.idle.length,
		busy: this.busy.size,
		maxSize: this.maxSize,
	});
}

let sharedDriver: WebViewDriver | undefined;

const parseSize = (raw: string | undefined): number | undefined => {
	if (raw === undefined) return undefined;
	const n = Number(raw);
	return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
};

const parseBackend = (raw: string | undefined): Backend | undefined => {
	if (raw === "chrome" || raw === "webkit") return raw;
	return undefined;
};

/**
 * Process-wide singleton driver. Lazily constructed on first call.
 *
 * Tunables:
 * - `BTR_POOL_SIZE` (default `1`) — concurrent WebViews.
 * - `BTR_BACKEND` (default `webkit` on macOS, `chrome` elsewhere).
 * - `BTR_FORWARD_CONSOLE` (default off) — when `1`, browser `console.*`
 *   output is piped to the host process during `runUserFileWithDriver`.
 * - `BTR_CONSOLE_DEPTH` (default `3`) — nesting depth used when serializing
 *   host objects (AudioContext, DOM nodes, etc.) for forwarded console output.
 */
export const getSharedDriver = (): WebViewDriver => {
	if (sharedDriver === undefined) {
		const size = parseSize(process.env[ENV.POOL_SIZE]);
		const backend = parseBackend(process.env[ENV.BACKEND]);
		const opts: { maxSize?: number; backend?: Backend } = {};
		if (size !== undefined) opts.maxSize = size;
		if (backend !== undefined) opts.backend = backend;
		sharedDriver = WebViewDriver.from(opts);
	}
	return sharedDriver;
};

/**
 * Test-only helper — drops the singleton so the next `getSharedDriver()` call
 * builds a fresh one. Does *not* close the previous driver; callers that care
 * should hold the reference and call `.close()` themselves.
 */
export const resetSharedDriverForTesting = (): void => {
	sharedDriver = undefined;
};
