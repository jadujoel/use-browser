/**
 * `JSON.stringify` with cycle detection and bigint support, falling back to
 * `String(v)` if stringification fails. Shared by the assertion matchers
 * (`expect.ts`) and the error serializer (`serialize-error.ts`).
 */
export const safeStringify = (v: unknown): string => {
	if (typeof v === "function") return `[Function ${v.name || "anonymous"}]`;
	if (typeof v === "symbol") return v.toString();
	if (typeof v === "bigint") return `${v.toString()}n`;
	if (typeof v === "string") return JSON.stringify(v);
	try {
		const seen = new WeakSet<object>();
		return (
			JSON.stringify(v, (_k, val) => {
				if (typeof val === "object" && val !== null) {
					if (seen.has(val as object)) return "[Circular]";
					seen.add(val as object);
				}
				if (typeof val === "bigint") return `${val.toString()}n`;
				return val as unknown;
			}) ?? String(v)
		);
	} catch {
		return String(v);
	}
};
