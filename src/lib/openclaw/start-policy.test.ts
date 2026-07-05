import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { assertRealOpenClawRuntimeEnabled, shouldUseRealOpenClawRuntime } from "./start-policy";

const originalOpenClawRealRuntime = process.env.OPENCLAW_REAL_RUNTIME;

afterEach(() => {
  if (originalOpenClawRealRuntime === undefined) {
    delete process.env.OPENCLAW_REAL_RUNTIME;
  } else {
    process.env.OPENCLAW_REAL_RUNTIME = originalOpenClawRealRuntime;
  }
});

describe("assertRealOpenClawRuntimeEnabled", () => {
  it("rejects only when real OpenClaw runtime is explicitly disabled", () => {
    process.env.OPENCLAW_REAL_RUNTIME = "0";

    assert.throws(
      () => assertRealOpenClawRuntimeEnabled(),
      /OPENCLAW_REAL_RUNTIME=0/,
    );
  });

  it("allows PlanF entry by default", () => {
    delete process.env.OPENCLAW_REAL_RUNTIME;

    assert.doesNotThrow(() => assertRealOpenClawRuntimeEnabled());
  });

  it("allows PlanF entry when real OpenClaw runtime is explicitly enabled", () => {
    process.env.OPENCLAW_REAL_RUNTIME = "1";

    assert.doesNotThrow(() => assertRealOpenClawRuntimeEnabled());
  });
});

describe("shouldUseRealOpenClawRuntime", () => {
  it("returns true by default", () => {
    delete process.env.OPENCLAW_REAL_RUNTIME;

    assert.equal(shouldUseRealOpenClawRuntime(), true);
  });

  it("returns true when real OpenClaw runtime is enabled", () => {
    process.env.OPENCLAW_REAL_RUNTIME = "1";

    assert.equal(shouldUseRealOpenClawRuntime(), true);
  });

  it("returns false when real OpenClaw runtime is explicitly disabled", () => {
    process.env.OPENCLAW_REAL_RUNTIME = "0";

    assert.equal(shouldUseRealOpenClawRuntime(), false);
  });
});
