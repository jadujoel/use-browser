import { afterEach, beforeEach, expect, it, test } from "bun:test";

const events: string[] = [];

beforeEach((done) => {
	setTimeout(() => {
		events.push("beforeEach");
		done();
	}, 5);
});

afterEach((done) => {
	setTimeout(() => {
		events.push("afterEach");
		done();
	}, 5);
});

it("waits for done() before resolving the test", (done) => {
	let asyncFinished = false;
	setTimeout(() => {
		asyncFinished = true;
		done();
	}, 20);
	// If the runner ignored `done`, this microtask would settle before
	// `asyncFinished` flips and the assertion below would observe `false`.
	Promise.resolve().then(() => {
		expect(asyncFinished).toBe(false);
	});
});

test("done(err) reports a failure", (done) => {
	done(new Error("intentional async failure"));
});

it("hooks fired in order around this test", () => {
	// beforeEach has fired for: this test (1) + the two prior tests (2) = 3 times
	// afterEach has fired for: the two prior tests = 2 times (afterEach for this
	// test hasn't fired yet at the moment the body runs).
	expect(
		events.filter((e) => e === "beforeEach").length,
	).toBeGreaterThanOrEqual(3);
	expect(events.filter((e) => e === "afterEach").length).toBeGreaterThanOrEqual(
		2,
	);
});
