export interface SerializedError {
	readonly name: string;
	readonly message: string;
	readonly stack?: string;
}

export interface TestResult {
	readonly name: string;
	readonly ok: boolean;
	readonly durationMs: number;
	readonly error?: SerializedError;
}

export const SENTINEL_PREFIX = "__BTR__:" as const;
