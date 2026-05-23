const DEFAULT_IMAGE_MODEL = "gpt-image-2";
const DEFAULT_IMAGE_SIZE = "1024x1024";
const DEFAULT_OUTPUT_FORMAT = "png";
const DEFAULT_MODERATION = "auto";
const VIBE_BASE_URL = "https://www.vibeapi.cn/v1";
const FUCHEERS_BASE_URL = "https://www.fucheers.top/v1";
const COMFLY_BASE_URL = "https://ai.comfly.org/v1";
const ZHENZHEN_BASE_URL = "https://ai.t8star.cn/v1";
const COMFLY_RESPONSE_FORMAT = "b64_json";

function corsHeaders(request, env) {
  const configuredOrigin = env.CORS_ORIGIN?.trim();
  const requestOrigin = request.headers.get("Origin") || "*";
  const allowedOrigin = configuredOrigin || requestOrigin;

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function jsonResponse(request, env, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request, env),
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function getProviderBaseUrl(provider) {
  if (provider === "fucheers") return FUCHEERS_BASE_URL;
  if (provider === "comfly") return COMFLY_BASE_URL;
  if (provider === "zhenzhen") return ZHENZHEN_BASE_URL;
  return VIBE_BASE_URL;
}

function getProviderLabel(provider) {
  if (provider === "fucheers") return "Fucheers API";
  if (provider === "comfly") return "Comfly";
  if (provider === "zhenzhen") return "Zhenzhen";
  return "Vibe API";
}

function parseImageSize(size) {
  const match = typeof size === "string" ? size.match(/^(\d+)x(\d+)$/) : null;

  if (!match) {
    return { width: 1024, height: 1024 };
  }

  return {
    width: Number(match[1]),
    height: Number(match[2]),
  };
}

function toT8ImageSizeParams(size) {
  const { width, height } = parseImageSize(size);

  if (!width || !height) {
    return {};
  }

  function gcd(a, b) {
    return b === 0 ? a : gcd(b, a % b);
  }

  const divisor = gcd(width, height);
  const longestEdge = Math.max(width, height);

  return {
    aspect_ratio: `${width / divisor}:${height / divisor}`,
    image_size: longestEdge >= 3072 ? "4K" : longestEdge >= 1536 ? "2K" : "1K",
  };
}

function getSafeFileName(fileName, fallback) {
  const trimmed = typeof fileName === "string" ? fileName.trim() : "";
  const normalized = trimmed
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  if (!normalized) {
    return `${fallback}.png`;
  }

  return /\.[A-Za-z0-9]+$/.test(normalized) ? normalized : `${normalized}.png`;
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function dataUrlToBlob(dataUrl) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/i);

  if (!match) {
    throw new Error("Invalid reference image data URL");
  }

  return new Blob([base64ToBytes(match[2])], {
    type: match[1] || "image/png",
  });
}

function toDataImageUrl(value, fallbackMimeType = "image/png") {
  const normalized = typeof value === "string" ? value.trim() : "";

  if (!normalized) {
    return null;
  }

  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(normalized)) {
    return normalized;
  }

  return `data:${fallbackMimeType};base64,${normalized}`;
}

async function imageToBlob(image, index) {
  const url = typeof image?.url === "string" ? image.url.trim() : "";

  if (!url) {
    throw new Error(`Reference image ${index + 1} is empty`);
  }

  if (url.startsWith("data:")) {
    return dataUrlToBlob(url);
  }

  if (!/^https?:\/\//i.test(url)) {
    throw new Error(`Reference image ${index + 1} must be a data URL or HTTP URL`);
  }

  const response = await fetch(url, {
    headers: {
      Accept: "image/*",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch reference image ${index + 1}`);
  }

  return await response.blob();
}

async function readUpstreamJson(response, providerLabel) {
  const text = await response.text();
  let json;

  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${providerLabel} returned invalid JSON: ${text.slice(0, 200)}`);
  }

  if (!response.ok) {
    throw new Error(
      json?.error?.message || `${providerLabel} request failed with status ${response.status}`,
    );
  }

  return json;
}

async function generateImage(body) {
  const provider =
    body.provider === "fucheers" ||
    body.provider === "comfly" ||
    body.provider === "zhenzhen"
      ? body.provider
      : "vibe";
  const providerLabel = getProviderLabel(provider);
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";

  if (!apiKey) {
    throw new Error("API key is required");
  }

  const model = typeof body.model === "string" && body.model.trim()
    ? body.model.trim()
    : DEFAULT_IMAGE_MODEL;
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const size = typeof body.size === "string" && body.size.trim()
    ? body.size.trim()
    : DEFAULT_IMAGE_SIZE;
  const quality = typeof body.quality === "string" && body.quality.trim()
    ? body.quality.trim()
    : undefined;
  const outputFormat = typeof body.outputFormat === "string" && body.outputFormat.trim()
    ? body.outputFormat.trim()
    : DEFAULT_OUTPUT_FORMAT;
  const moderation = typeof body.moderation === "string" && body.moderation.trim()
    ? body.moderation.trim()
    : DEFAULT_MODERATION;
  const images = Array.isArray(body.images) ? body.images : [];
  const baseUrl = getProviderBaseUrl(provider);
  let json;

  if (!prompt) {
    throw new Error("Prompt is required");
  }

  if (provider === "zhenzhen") {
    const response = await fetch(`${baseUrl}/images/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        prompt,
        image:
          images.length === 0
            ? undefined
            : images.length === 1
              ? images[0].url
              : images.map((image) => image.url),
        response_format: COMFLY_RESPONSE_FORMAT,
        ...toT8ImageSizeParams(size),
      }),
    });

    json = await readUpstreamJson(response, providerLabel);
  } else if (images.length > 0) {
    const formData = new FormData();
    formData.append("model", model);
    formData.append("prompt", prompt);

    if (provider === "comfly") {
      formData.append("size", size);
      formData.append("response_format", COMFLY_RESPONSE_FORMAT);
    } else {
      formData.append("size", size);
      formData.append("output_format", outputFormat);
      formData.append("moderation", moderation);
    }

    if (quality) {
      formData.append("quality", quality);
    }

    const blobs = await Promise.all(images.map((image, index) => imageToBlob(image, index)));

    blobs.forEach((blob, index) => {
      formData.append(
        provider === "comfly" ? "image" : "image[]",
        blob,
        getSafeFileName(images[index]?.fileName, `reference-${index + 1}`),
      );
    });

    const response = await fetch(
      `${baseUrl}/${provider === "comfly" ? "images/edits" : "images/generations"}`,
      {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      body: formData,
      },
    );

    json = await readUpstreamJson(response, providerLabel);
  } else {
    const payload =
      provider === "comfly"
        ? {
            model,
            prompt,
            size,
            quality,
            response_format: COMFLY_RESPONSE_FORMAT,
          }
        : {
            model,
            prompt,
            size,
            quality,
            output_format: outputFormat,
            moderation,
          };
    const response = await fetch(`${baseUrl}/images/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    json = await readUpstreamJson(response, providerLabel);
  }

  const dimensions = parseImageSize(size);
  const resultImages = (json.data || [])
    .map((image) => {
      const imageUrl = toDataImageUrl(image?.b64_json) || image?.url;

      if (!imageUrl) {
        return null;
      }

      return {
        imageUrl,
        model,
        width: dimensions.width,
        height: dimensions.height,
      };
    })
    .filter(Boolean);

  if (resultImages.length === 0) {
    throw new Error(`${providerLabel} returned no image data`);
  }

  return {
    model,
    images: resultImages,
  };
}

const worker = {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request, env),
      });
    }

    const url = new URL(request.url);

    if (request.method !== "POST" || url.pathname !== "/api/ai/image") {
      return jsonResponse(request, env, { ok: false, error: "Not found" }, 404);
    }

    try {
      const body = await request.json();
      const result = await generateImage(body);

      return jsonResponse(request, env, {
        ok: true,
        jobId: crypto.randomUUID(),
        status: "completed",
        result,
      });
    } catch (error) {
      return jsonResponse(
        request,
        env,
        {
          ok: false,
          error: error instanceof Error ? error.message : "Image proxy failed",
        },
        500,
      );
    }
  },
};

export default worker;
