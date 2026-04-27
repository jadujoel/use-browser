"use browser";

// Intentionally throws at module-evaluation time, before any test() call,
// so the harness never installs window.__btrRun. The host runner should
// surface a useful error (referencing this thrown message) instead of the
// cryptic "window.__btrRun is not a function".
throw new Error("BTR_TOP_LEVEL_THROW: deliberately broken fixture");
