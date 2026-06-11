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

  return await fetcher(url.toString(), {
    method: request.method,
    headers: buildProxyHeaders(request),
    body,
    redirect: "manual",
    cache: "no-store",
  });
}

export const proxyOpenClawRequest = proxyBackendRequest;
