"use browser";

import { expect, it } from "bun:test";

it("plays an oscillator", (done) => {
	const ctx = new AudioContext();
	const osc = ctx.createOscillator();
	osc.connect(ctx.destination);
	osc.start();
	osc.stop(ctx.currentTime + 1);
	osc.onended = () => {
		ctx.close();
		console.log("Oscillator ended, test complete.");
		expect(true).toBe(true); // Dummy assertion to ensure the test framework registers this as a passing test.
		done();
	};
});
