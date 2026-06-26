import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";

export type AuthenticatedSession = NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
>;

export async function getRequestSession(
  request: Request,
): Promise<AuthenticatedSession | null> {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  return session?.user ? session : null;
}

export async function requireAuth(request: Request): Promise<
  | { ok: true; session: AuthenticatedSession }
  | { ok: false; response: NextResponse }
> {
  const session = await getRequestSession(request);

  if (!session) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Authentication required" },
        { status: 401 },
      ),
    };
  }

  return { ok: true, session };
}
