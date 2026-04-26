import type { SerializedError } from "../types";
import { AssertionError } from "./expect";

const previewValue = (v: unknown): string => {
  if (typeof v === "function") return `[Function ${v.name || "anonymous"}]`;
  if (typeof v === "symbol") return v.toString();
  if (typeof v === "bigint") return `${v.toString()}n`;
  try {
    const seen = new WeakSet();
    return JSON.stringify(v, (_k, val) => {
      if (typeof val === "object" && val !== null) {
        if (seen.has(val as object)) return "[Circular]";
        seen.add(val as object);
      }
      if (typeof val === "bigint") return `${val.toString()}n`;
      return val as unknown;
    }) ?? String(v);
  } catch {
    return String(v);
  }
};

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
    extras.actualPreview = previewValue(err.actual);
    extras.expectedPreview = previewValue(err.expected);
  }

  return { ...base, ...extras };
};
