export function assertRealOpenClawRuntimeEnabled(): void {
  if (process.env.OPENCLAW_REAL_RUNTIME === "0") {
    throw new Error(
      "OPENCLAW_REAL_RUNTIME=0 disables the real OpenClaw runtime.",
    );
  }
}

export function shouldUseRealOpenClawRuntime(): boolean {
  return process.env.OPENCLAW_REAL_RUNTIME !== "0";
}
