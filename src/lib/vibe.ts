import "server-only";

// GenLink Vibe API client for server-side route handlers and actions only.

const VIBE_BASE_URL = process.env.VIBE_BASE_URL ?? "https://www.vibeapi.cn/v1";
const VIBE_API_KEY = process.env.VIBE_API_KEY ?? "";
const VIBE_GEMINI_BASE_URL = "https://www.vibeapi.cn";

const DEFAULT_TEXT_MODEL = "gpt-4o-mini";
const DEFAULT_IMAGE_MODEL = "gpt-image-2";
const DEFAULT_IMAGE_SIZE = "1024x1024";
const REQUEST_TIMEOUT_MS = 60_000;

export interface GenerateTextParams {
  prompt: string;
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface GenerateTextResult {
  content: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface GenerateImageParams {
  prompt: string;
  model?: string;
  size?: string;
  n?: number;
}

export interface GenerateImageResult {
  imageUrl: string;
  model: string;
  width: number;
  height: number;
}

export class VibeApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "VibeApiError";
  }
}

interface VibeChatResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  model?: string;
  error?: {
    message?: string;
  };
}

interface VibeImageResponse {
  data?: Array<{
    url?: string;
    b64_json?: string;
  }>;
  error?: {
    message?: string;
  };
}

interface VibeGeminiImageResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: {
          mimeType?: string;
          data?: string;
        };
      }>;
    };
  }>;
  error?: {
    message?: string;
    code?: number | string;
    status?: string;
  };
}

function assertConfigured(): void {
  if (!VIBE_API_KEY) {
    throw new VibeApiError(500, "VIBE_API_KEY is not configured");
  }
}

function createHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${VIBE_API_KEY}`,
  };
}

function parseImageSize(size?: string): { width: number; height: number } {
  const match = size?.match(/^(\d+)x(\d+)$/i);

  if (!match) {
    return { width: 1024, height: 1024 };
  }

  return {
    width: Number(match[1]),
    height: Number(match[2]),
  };
}

function normalizeMessageContent(
  content: string | Array<{ type?: string; text?: string }> | undefined,
): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => (item.type === "text" ? item.text ?? "" : ""))
      .join("");
  }

  return "";
}

function toGeminiAspectRatio(size?: string): string {
  const { width, height } = parseImageSize(size);
  const ratio = width / height;
  const supported = [
    "1:1",
    "1:4",
    "1:8",
    "2:3",
    "3:2",
    "3:4",
    "4:1",
    "4:3",
    "4:5",
    "5:4",
    "8:1",
    "9:16",
    "16:9",
    "21:9",
  ] as const;

  let best = "1:1";
  let bestDelta = Number.POSITIVE_INFINITY;

  for (const option of supported) {
    const [w, h] = option.split(":").map(Number);
    const delta = Math.abs(ratio - w / h);
    if (delta < bestDelta) {
      best = option;
      bestDelta = delta;
    }
  }

  return best;
}

function toGeminiImageSize(size?: string): string {
  const { width, height } = parseImageSize(size);
  const maxDimension = Math.max(width, height);

  if (maxDimension <= 768) {
    return "512px";
  }

  if (maxDimension <= 1280) {
    return "1K";
  }

  if (maxDimension <= 2560) {
    return "2K";
  }

  return "4K";
}

async function requestJson<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  return requestJsonWithBaseUrl<T>(VIBE_BASE_URL, path, body);
}

async function requestJsonWithBaseUrl<T>(
  baseUrl: string,
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  assertConfigured();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: createHeaders(),
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();
    const json = text ? (JSON.parse(text) as T) : ({} as T);

    if (!response.ok) {
      const message =
        (json as { error?: { message?: string } }).error?.message ??
        `Vibe API request failed with status ${response.status}`;

      throw new VibeApiError(response.status, message, json);
    }

    return json;
  } catch (error) {
    if (error instanceof VibeApiError) {
      throw error;
    }

    if (error instanceof SyntaxError) {
      throw new VibeApiError(502, "Vibe API returned invalid JSON");
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new VibeApiError(504, "Vibe API request timed out");
    }

    throw new VibeApiError(
      502,
      error instanceof Error ? error.message : "Vibe API request failed",
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateText(
  params: GenerateTextParams,
): Promise<GenerateTextResult> {
  const model = params.model ?? DEFAULT_TEXT_MODEL;
  const messages: Array<{ role: "system" | "user"; content: string }> = [];

  if (params.systemPrompt) {
    messages.push({ role: "system", content: params.systemPrompt });
  }

  messages.push({ role: "user", content: params.prompt });

  const json = await requestJson<VibeChatResponse>("/chat/completions", {
    model,
    messages,
    temperature: params.temperature ?? 0.7,
    max_tokens: params.maxTokens,
  });

  const content = normalizeMessageContent(json.choices?.[0]?.message?.content);

  return {
    content,
    model: json.model ?? model,
    promptTokens: json.usage?.prompt_tokens,
    completionTokens: json.usage?.completion_tokens,
    totalTokens: json.usage?.total_tokens,
  };
}

async function generateImageOpenAI(
  params: GenerateImageParams,
): Promise<GenerateImageResult> {
  const model = params.model ?? DEFAULT_IMAGE_MODEL;
  const size = params.size ?? DEFAULT_IMAGE_SIZE;

  const json = await requestJson<VibeImageResponse>("/images/generations", {
    model,
    prompt: params.prompt,
    size,
    n: params.n ?? 1,
  });

  const image = json.data?.[0];
  const imageUrl = image?.b64_json
    ? `data:image/png;base64,${image.b64_json}`
    : image?.url;

  if (!imageUrl) {
    throw new VibeApiError(502, "Vibe API returned no image data", json);
  }

  const dimensions = parseImageSize(size);

  return {
    imageUrl,
    model,
    width: dimensions.width,
    height: dimensions.height,
  };
}

async function generateImageGemini(
  params: GenerateImageParams,
): Promise<GenerateImageResult> {
  const model = params.model ?? DEFAULT_IMAGE_MODEL;
  const size = params.size ?? DEFAULT_IMAGE_SIZE;

  const json = await requestJsonWithBaseUrl<VibeGeminiImageResponse>(
    VIBE_GEMINI_BASE_URL,
    `/v1beta/models/${model}:generateContent`,
    {
      contents: [
        {
          parts: [{ text: params.prompt }],
        },
      ],
      generationConfig: {
        responseModalities: ["IMAGE"],
        imageConfig: {
          aspectRatio: toGeminiAspectRatio(size),
          imageSize: toGeminiImageSize(size),
        },
      },
    },
  );

  const imagePart = json.candidates?.[0]?.content?.parts?.find(
    (part) => part.inlineData?.data,
  );
  const inlineData = imagePart?.inlineData;

  if (!inlineData?.data) {
    throw new VibeApiError(502, "Vibe API returned no image data", json);
  }

  const mimeType = inlineData.mimeType ?? "image/png";
  const dimensions = parseImageSize(size);

  return {
    imageUrl: `data:${mimeType};base64,${inlineData.data}`,
    model,
    width: dimensions.width,
    height: dimensions.height,
  };
}

export async function generateImage(
  params: GenerateImageParams,
): Promise<GenerateImageResult> {
  if (params.model && /^gemini-/i.test(params.model)) {
    return generateImageGemini(params);
  }

  return generateImageOpenAI(params);
}
