export interface AuthApiResponse {
  ok?: boolean;
  error?: string;
  devCode?: string;
}

export async function readAuthApiResponse(
  response: Response,
): Promise<AuthApiResponse> {
  const text = await response.text().catch(() => "");

  if (!text.trim()) {
    return {};
  }

  try {
    const result = JSON.parse(text) as unknown;
    return result && typeof result === "object"
      ? (result as AuthApiResponse)
      : {};
  } catch {
    return {};
  }
}
