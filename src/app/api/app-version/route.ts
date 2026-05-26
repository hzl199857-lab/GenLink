import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const APP_VERSION =
  process.env.NEXT_PUBLIC_APP_VERSION ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  process.env.COMMIT_SHA ||
  "unknown";

export function GET() {
  return NextResponse.json(
    { version: APP_VERSION },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    },
  );
}
