import type { NextConfig } from "next";
import { execSync } from "node:child_process";

function getBuildVersion() {
  const envVersion =
    process.env.NEXT_PUBLIC_APP_VERSION ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    process.env.COMMIT_SHA;

  if (envVersion) return envVersion;

  try {
    return execSync("git rev-parse --short=12 HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return new Date().toISOString();
  }
}

const nextConfig: NextConfig = {
  devIndicators: false,
  outputFileTracingIncludes: {
    "/api/openclaw/planf/ecom/start": [
      "./rules/planf-canvas/**/*",
      "./rules/genlink-overrides/**/*",
    ],
    "/api/planf/ecom-workflow": ["./rules/planf-canvas/**/*"],
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: getBuildVersion(),
  },
};

export default nextConfig;
