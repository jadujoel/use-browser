"use browser";

// No tests, no top-level errors. Should be reported as a passing file with
// zero tests rather than crashing the runner.
const x = 1 + 1;
void x;
