import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";

const events: string[] = [];

beforeAll(() => {
	events.push("rootBeforeAll");
});
afterAll(() => {
	events.push("rootAfterAll");
});
beforeEach(() => {
	events.push("rootBeforeEach");
});
afterEach(() => {
	events.push("rootAfterEach");
});

test("first root test sees rootBeforeAll", () => {
	expect(events.filter((e) => e === "rootBeforeAll")).toHaveLength(1);
	expect(events.filter((e) => e === "rootBeforeEach")).toHaveLength(1);
});

describe("nested", () => {
	beforeEach(() => {
		events.push("nestedBeforeEach");
	});
	afterEach(() => {
		events.push("nestedAfterEach");
	});

	test("inherits root beforeEach and runs nested beforeEach after", () => {
		// before this test ran: rootBeforeEach (twice now), nestedBeforeEach (once)
		expect(
			events.filter((e) => e === "rootBeforeEach").length,
		).toBeGreaterThanOrEqual(2);
		expect(events.filter((e) => e === "nestedBeforeEach")).toHaveLength(1);
	});
});

test("second root test sees afterEach from previous test", () => {
	// After test 1: rootAfterEach. After nested test: nestedAfterEach + rootAfterEach.
	expect(
		events.filter((e) => e === "rootAfterEach").length,
	).toBeGreaterThanOrEqual(2);
	expect(events.filter((e) => e === "nestedAfterEach")).toHaveLength(1);
});
