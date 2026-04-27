import { USE_BROWSER_DIRECTIVE } from "./constants";

const isWhitespace = (c: string | undefined): boolean =>
	c === " " || c === "\t" || c === "\n" || c === "\r";

const skipWhitespaceAndComments = (src: string, start: number): number => {
	let i = start;
	while (i < src.length) {
		const before = i;
		while (i < src.length && isWhitespace(src[i])) i++;
		if (src[i] === "/" && src[i + 1] === "/") {
			while (i < src.length && src[i] !== "\n") i++;
		} else if (src[i] === "/" && src[i + 1] === "*") {
			i += 2;
			while (i < src.length - 1 && !(src[i] === "*" && src[i + 1] === "/")) i++;
			i += 2;
		}
		if (i === before) break;
	}
	return i;
};

/**
 * Returns true iff the first non-comment, non-whitespace token in `src`
 * is the string literal `"use browser"` (or `'use browser'`).
 *
 * Mirrors React Server Components' `"use client"` recognition: the directive
 * must be at the very top of the file, before any imports or other statements.
 */
export const hasUseBrowserDirective = (src: string): boolean => {
	// Skip BOM and shebang
	let start = 0;
	if (src.charCodeAt(0) === 0xfeff) start = 1;
	if (src[start] === "#" && src[start + 1] === "!") {
		while (start < src.length && src[start] !== "\n") start++;
	}
	const i = skipWhitespaceAndComments(src, start);
	if (i >= src.length) return false;
	const quote = src[i];
	if (quote !== '"' && quote !== "'") return false;
	const end = src.indexOf(quote, i + 1);
	if (end === -1) return false;
	return src.slice(i + 1, end) === USE_BROWSER_DIRECTIVE;
};
