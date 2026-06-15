export function formatAgentFetchFailure(
  error: unknown,
  fallback: string,
  endpoint: string,
): string {
  const message = error instanceof Error ? error.message : "";

  if (/failed to fetch|networkerror|load failed|fetch failed/i.test(message)) {
    return `${fallback}：请求没有收到服务端响应（${endpoint}）。云端常见原因是 Vercel 函数超时、部署未生效，或网络连接被中断。`;
  }

  return message ? `${fallback}：${message}` : fallback;
}

export async function fetchAgentApi(
  input: RequestInfo | URL,
  init: RequestInit,
  fallback: string,
): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (error) {
    const endpoint = typeof input === "string" ? input : input.toString();

    throw new Error(formatAgentFetchFailure(error, fallback, endpoint));
  }
}
