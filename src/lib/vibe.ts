import "server-only";

// GenLink Vibe API client for server-side route handlers and actions only.

const VIBE_BASE_URL = process.env.VIBE_BASE_URL ?? "https://www.vibeapi.cn/v1";
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
  apiKey?: string;
  images?: Array<{
    url: string;
  }>;
}

export interface GenerateTextResult {
  content: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface TextStreamChunk {
  type: "delta" | "done" | "error";
  delta?: string;
  result?: GenerateTextResult;
  error?: string;
}

export interface GenerateImageParams {
  prompt: string;
  model?: string;
  size?: string;
  quality?: string;
  n?: number;
  apiKey?: string;
  images?: Array<{
    url: string;
    fileName?: string;
  }>;
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

interface ClaudeMessageResponse {
  content?: Array<{ type?: string; text?: string }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  model?: string;
  error?: {
    message?: string;
  };
}

type ChatMessageContentPart =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "image_url";
      image_url: {
        url: string;
      };
    };

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

async function createImageFilePart(
  image: {
    url: string;
    fileName?: string;
  },
  index: number,
): Promise<Blob> {
  const trimmedUrl = image.url.trim();

  if (!trimmedUrl) {
    throw new VibeApiError(400, `Reference image ${index + 1} is empty`);
  }

  const dataUrl = parseDataUrl(trimmedUrl);

  if (dataUrl) {
    return new Blob([Buffer.from(dataUrl.data, "base64")], {
      type: dataUrl.mediaType,
    });
  }

  const response = await fetch(trimmedUrl);

  if (!response.ok) {
    throw new VibeApiError(
      response.status,
      `Failed to fetch reference image ${index + 1}`,
    );
  }

  const bytes = await response.arrayBuffer();
  return new Blob([bytes], {
    type: response.headers.get("content-type") || "image/png",
  });
}

function assertConfigured(apiKey?: string): string {
  const resolvedApiKey = apiKey?.trim();

  if (!resolvedApiKey) {
    throw new VibeApiError(400, "API key is required");
  }

  return resolvedApiKey;
}

function createHeaders(apiKey?: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${assertConfigured(apiKey)}`,
  };
}

function createAnthropicHeaders(apiKey?: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    "x-api-key": assertConfigured(apiKey),
    "anthropic-version": "2023-06-01",
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

function isClaudeModel(model: string): boolean {
  return /^claude-/i.test(model);
}

function parseDataUrl(url: string):
  | { mediaType: string; data: string }
  | null {
  const match = url.match(/^data:([^;]+);base64,(.+)$/i);

  if (!match) {
    return null;
  }

  return {
    mediaType: match[1],
    data: match[2],
  };
}

function createOpenAiUserContent(
  prompt: string,
  images?: Array<{
    url: string;
  }>,
): string | ChatMessageContentPart[] {
  const userContent: ChatMessageContentPart[] = [
    {
      type: "text",
      text: prompt,
    },
  ];

  for (const image of images ?? []) {
    if (!image.url.trim()) {
      continue;
    }

    userContent.push({
      type: "image_url",
      image_url: {
        url: image.url,
      },
    });
  }

  return userContent.length === 1 ? prompt : userContent;
}

function createClaudeUserContent(
  prompt: string,
  images?: Array<{
    url: string;
  }>,
): Array<
  | { type: "text"; text: string }
  | {
      type: "image";
      source:
        | { type: "base64"; media_type: string; data: string }
        | { type: "url"; url: string };
    }
> {
  const content: Array<
    | { type: "text"; text: string }
    | {
        type: "image";
        source:
          | { type: "base64"; media_type: string; data: string }
          | { type: "url"; url: string };
      }
  > = [{ type: "text", text: prompt }];

  for (const image of images ?? []) {
    const url = image.url.trim();

    if (!url) {
      continue;
    }

    const dataUrl = parseDataUrl(url);

    if (dataUrl) {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: dataUrl.mediaType,
          data: dataUrl.data,
        },
      });
      continue;
    }

    content.push({
      type: "image",
      source: {
        type: "url",
        url,
      },
    });
  }

  return content;
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
  apiKey?: string,
): Promise<T> {
  return requestJsonWithBaseUrl<T>(
    VIBE_BASE_URL,
    path,
    body,
    apiKey,
    createHeaders,
  );
}

async function requestJsonWithBaseUrl<T>(
  baseUrl: string,
  path: string,
  body: Record<string, unknown>,
  apiKey?: string,
  requestHeadersFactory: (apiKey?: string) => HeadersInit = createHeaders,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: requestHeadersFactory(apiKey),
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

async function requestStream(
  path: string,
  body: Record<string, unknown>,
  apiKey?: string,
  requestHeadersFactory: (apiKey?: string) => HeadersInit = createHeaders,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${VIBE_BASE_URL}${path}`, {
      method: "POST",
      headers: requestHeadersFactory(apiKey),
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();

      try {
        const json = text
          ? (JSON.parse(text) as { error?: { message?: string } })
          : {};
        throw new VibeApiError(
          response.status,
          json.error?.message ??
            `Vibe API request failed with status ${response.status}`,
          json,
        );
      } catch (error) {
        if (error instanceof VibeApiError) {
          throw error;
        }

        throw new VibeApiError(
          response.status,
          text || `Vibe API request failed with status ${response.status}`,
        );
      }
    }

    if (!response.body) {
      throw new VibeApiError(502, "Vibe API returned no response stream");
    }

    return response;
  } catch (error) {
    if (error instanceof VibeApiError) {
      throw error;
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

async function requestForm<T>(
  path: string,
  formData: FormData,
  apiKey?: string,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${VIBE_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${assertConfigured(apiKey)}`,
      },
      body: formData,
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

function createSseChunk(chunk: TextStreamChunk): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`);
}

function normalizeOpenAiDeltaContent(
  content:
    | string
    | Array<{ type?: string; text?: string }>
    | Array<{ type?: string; text?: { value?: string } | string }>
    | undefined,
): string {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((item) => {
      if (item.type !== "text") {
        return "";
      }

      if (typeof item.text === "string") {
        return item.text;
      }

      if (item.text && typeof item.text === "object") {
        return item.text.value ?? "";
      }

      return "";
    })
    .join("");
}

export async function generateTextStream(
  params: GenerateTextParams,
): Promise<ReadableStream<Uint8Array>> {
  const model = params.model ?? DEFAULT_TEXT_MODEL;
  const isClaude = isClaudeModel(model);
  const path = isClaude ? "/messages" : "/chat/completions";
  const body = isClaude
    ? {
        model,
        system: params.systemPrompt,
        messages: [
          {
            role: "user",
            content: createClaudeUserContent(params.prompt, params.images),
          },
        ],
        temperature: params.temperature ?? 0.7,
        max_tokens: params.maxTokens ?? 1024,
        stream: true,
      }
    : {
        model,
        messages: [
          ...(params.systemPrompt
            ? [{ role: "system" as const, content: params.systemPrompt }]
            : []),
          {
            role: "user" as const,
            content: createOpenAiUserContent(params.prompt, params.images),
          },
        ],
        temperature: params.temperature ?? 0.7,
        max_tokens: params.maxTokens,
        stream: true,
      };

  const upstreamResponse = await requestStream(
    path,
    body,
    params.apiKey,
    isClaude ? createAnthropicHeaders : createHeaders,
  );
  const reader = upstreamResponse.body!.getReader();
  const decoder = new TextDecoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let buffer = "";
      let currentEvent = "message";
      let aggregatedText = "";
      let resolvedModel = model;

      const emitDone = () => {
        controller.enqueue(
          createSseChunk({
            type: "done",
            result: {
              content: aggregatedText,
              model: resolvedModel,
            },
          }),
        );
      };

      const processEvent = (eventName: string, dataLines: string[]) => {
        const data = dataLines.join("\n").trim();

        if (!data) {
          return;
        }

        if (data === "[DONE]") {
          emitDone();
          controller.close();
          return;
        }

        const json = JSON.parse(data) as Record<string, unknown>;

        if (typeof json.model === "string" && json.model) {
          resolvedModel = json.model;
        }

        if (!isClaude) {
          const choice = Array.isArray(json.choices)
            ? (json.choices[0] as {
                delta?: {
                  content?:
                    | string
                    | Array<{
                        type?: string;
                        text?: { value?: string } | string;
                      }>;
                };
                finish_reason?: string | null;
              } | undefined)
            : undefined;

          const delta = normalizeOpenAiDeltaContent(choice?.delta?.content);

          if (delta) {
            aggregatedText += delta;
            controller.enqueue(createSseChunk({ type: "delta", delta }));
          }

          if (choice?.finish_reason) {
            emitDone();
            controller.close();
          }

          return;
        }

        if (
          eventName === "content_block_delta" &&
          typeof json.delta === "object" &&
          json.delta !== null
        ) {
          const delta = (json.delta as { text?: string }).text ?? "";

          if (delta) {
            aggregatedText += delta;
            controller.enqueue(createSseChunk({ type: "delta", delta }));
          }

          return;
        }

        if (eventName === "message_stop") {
          emitDone();
          controller.close();
        }
      };

      try {
        while (true) {
          const { value, done } = await reader.read();

          if (done) {
            if (aggregatedText) {
              emitDone();
            }
            controller.close();
            break;
          }

          buffer += decoder.decode(value, { stream: true });

          while (true) {
            const separatorIndex = buffer.indexOf("\n\n");

            if (separatorIndex === -1) {
              break;
            }

            const rawEvent = buffer.slice(0, separatorIndex);
            buffer = buffer.slice(separatorIndex + 2);

            const lines = rawEvent.split(/\r?\n/);
            const dataLines: string[] = [];
            currentEvent = "message";

            for (const line of lines) {
              if (line.startsWith("event:")) {
                currentEvent = line.slice(6).trim();
              } else if (line.startsWith("data:")) {
                dataLines.push(line.slice(5).trimStart());
              }
            }

            processEvent(currentEvent, dataLines);
          }
        }
      } catch (error) {
        controller.enqueue(
          createSseChunk({
            type: "error",
            error:
              error instanceof Error ? error.message : "Text stream failed",
          }),
        );
        controller.close();
      } finally {
        reader.releaseLock();
      }
    },
  });
}

export async function generateText(
  params: GenerateTextParams,
): Promise<GenerateTextResult> {
  const model = params.model ?? DEFAULT_TEXT_MODEL;
  if (isClaudeModel(model)) {
    const json = await requestJsonWithBaseUrl<ClaudeMessageResponse>(
      VIBE_BASE_URL,
      "/messages",
      {
        model,
        system: params.systemPrompt,
        messages: [
          {
            role: "user",
            content: createClaudeUserContent(params.prompt, params.images),
          },
        ],
        temperature: params.temperature ?? 0.7,
        max_tokens: params.maxTokens ?? 1024,
      },
      params.apiKey,
      createAnthropicHeaders,
    );

    const content = normalizeMessageContent(json.content);
    const promptTokens = json.usage?.input_tokens;
    const completionTokens = json.usage?.output_tokens;

    return {
      content,
      model: json.model ?? model,
      promptTokens,
      completionTokens,
      totalTokens:
        typeof promptTokens === "number" && typeof completionTokens === "number"
          ? promptTokens + completionTokens
          : undefined,
    };
  }

  const json = await requestJson<VibeChatResponse>(
    "/chat/completions",
    {
      model,
      messages: [
        ...(params.systemPrompt
          ? [{ role: "system" as const, content: params.systemPrompt }]
          : []),
        {
          role: "user" as const,
          content: createOpenAiUserContent(params.prompt, params.images),
        },
      ],
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens,
    },
    params.apiKey,
  );

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
  const quality = params.quality;
  let json: VibeImageResponse;

  if (params.images?.length) {
    const formData = new FormData();
    formData.append("model", model);
    formData.append("prompt", params.prompt);

    if (size) {
      formData.append("size", size);
    }

    if (quality) {
      formData.append("quality", quality);
    }

    const imageBlobs = await Promise.all(
      params.images.map((image, index) => createImageFilePart(image, index)),
    );

    imageBlobs.forEach((blob, index) => {
      formData.append(
        "image[]",
        blob,
        params.images?.[index]?.fileName?.trim() || `reference-${index + 1}.png`,
      );
    });

    json = await requestForm<VibeImageResponse>(
      "/images/edits",
      formData,
      params.apiKey,
    );
  } else {
    json = await requestJson<VibeImageResponse>(
      "/images/generations",
      {
        model,
        prompt: params.prompt,
        size,
        quality,
        n: params.n ?? 1,
      },
      params.apiKey,
    );
  }

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
    params.apiKey,
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
