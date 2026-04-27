import type { SerializedError } from "../types";
import { AssertionError } from "./expect";
import { safeStringify } from "./safe-stringify";

export const serializeError = (err: unknown): SerializedError => {
	if (!(err instanceof Error)) {
		return { name: "Error", message: String(err) };
	}

	const base: { name: string; message: string; stack?: string } = {
		name: err.name,
		message: err.message,
	};
	if (err.stack !== undefined) base.stack = err.stack;

	const extras: {
		cause?: SerializedError;
		matcherName?: string;
		actualPreview?: string;
		expectedPreview?: string;
	} = {};

	if (err.cause !== undefined) {
		extras.cause = serializeError(err.cause);
	}

	if (err instanceof AssertionError) {
		extras.matcherName = err.matcherName;
		extras.actualPreview = safeStringify(err.actual);
		extras.expectedPreview = safeStringify(err.expected);
	}

	return { ...base, ...extras };
};
