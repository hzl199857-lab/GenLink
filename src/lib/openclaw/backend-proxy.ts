const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export class BackendProxyError extends Error {
  readonly targetUrl: string;

  constructor(
    message: string,
    targetUrl: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "BackendProxyError";
    this.targetUrl = targetUrl;
  }
}

export function getAgentBackendBaseUrl(): string | undefined {
  const value = process.env.GENLINK_AGENT_BACKEND_URL?.trim();

  return value || undefined;
}

function buildProxyHeaders(request: Request): Headers {
  const headers = new Headers();

  for (const [key, value] of request.headers) {
    const lowerKey = key.toLowerCase();

    if (HOP_BY_HOP_HEADERS.has(lowerKey) || lowerKey.startsWith("x-")) {
      continue;
    }

    headers.set(key, value);
  }

  return headers;
}

function isJsonResponse(response: Response): boolean {
  return (response.headers.get("content-type") ?? "").toLowerCase().includes("application/json");
}

function getOpenClawStage(pathname: string): string {
  if (pathname.endsWith("/start")) {
    return "start_session";
  }

  if (pathname.endsWith("/confirm")) {
    return "confirm_plan";
  }

  if (pathname.endsWith("/create-workflow")) {
    return "create_workflow";
  }

  return "backend_proxy";
}

async function wrapNonJsonBackendResponse(
  response: Response,
  targetUrl: string,
  pathname: string,
): Promise<Response> {
  if (isJsonResponse(response)) {
    return response;
  }

  const text = await response.text().catch(() => "");
  const snippet = text.trim().replace(/\s+/g, " ").slice(0, 180);

  return Response.json(
    {
      ok: false,
      error: snippet
        ? `OpenClaw backend returned non-JSON response (${response.status} ${response.statusText}): ${snippet}`
        : `OpenClaw backend returned non-JSON response (${response.status} ${response.statusText})`,
      stage: getOpenClawStage(pathname),
      retryable: response.status >= 500 || response.status === 0,
      targetUrl,
    },
    { status: response.status || 502 },
  );
}

export async function proxyBackendRequest(
  request: Request,
  pathname = new URL(request.url).pathname,
  fetcher: FetchLike = fetch,
): Promise<Response | undefined> {
  const baseUrl = getAgentBackendBaseUrl();

  if (!baseUrl) {
    return undefined;
  }

  const url = new URL(pathname, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  const body = request.method === "GET" || request.method === "HEAD"
    ? undefined
    : await request.text();

  try {
    const response = await fetcher(url.toString(), {
      method: request.method,
      headers: buildProxyHeaders(request),
      body,
      redirect: "manual",
      cache: "no-store",
    });

    return await wrapNonJsonBackendResponse(response, url.toString(), pathname);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown proxy error";

    throw new BackendProxyError(message, url.toString(), { cause: error });
  }
}

export const proxyOpenClawRequest = proxyBackendRequest;
