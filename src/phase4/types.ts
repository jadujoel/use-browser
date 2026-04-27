import type { TestResult } from "../phase2/types";

export interface TestResultWithMeta extends TestResult {
	readonly screenshotPath?: string;
}
