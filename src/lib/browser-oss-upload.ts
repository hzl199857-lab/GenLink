export type BrowserOssUploadPolicy = "direct-with-fallback" | "server";

export type BrowserOssUploadTarget = {
  uploadUrl: string;
  hostedUrl: string;
  headers: Record<string, string>;
};

export type BrowserOssUploadFetch = typeof fetch;

export type BrowserOssUploadResult = {
  hostedUrl: string;
  mode: "direct" | "server";
};

export type UploadImageAssetInput = {
  data: Blob;
  contentType: string;
  fileName?: string;
  folder: string;
  policy?: BrowserOssUploadPolicy;
  fetchImpl?: BrowserOssUploadFetch;
};

export type UploadReferenceImageBlobInput = {
  blob: Blob;
  fileName?: string;
  fetchImpl?: BrowserOssUploadFetch;
};

export function getBrowserOssUploadPolicy(
  value = process.env.NEXT_PUBLIC_IMAGE_UPLOAD_MODE,
): BrowserOssUploadPolicy {
  return value?.trim().toLowerCase() === "server" ? "server" : "direct-with-fallback";
}

export async function uploadImageAsset(input: UploadImageAssetInput): Promise<BrowserOssUploadResult> {
  const policy = input.policy ?? getBrowserOssUploadPolicy();
  const fetchImpl = input.fetchImpl ?? fetch;

  if (policy === "server") {
    return {
      hostedUrl: await uploadImageAssetViaServer(input, fetchImpl),
      mode: "server",
    };
  }

  const target = await createImageAssetUploadTarget(input, fetchImpl);
  let response: Response;

  try {
    response = await fetchImpl(target.uploadUrl, {
      method: "PUT",
      headers: target.headers,
      body: input.data,
    });
  } catch {
    return {
      hostedUrl: await uploadImageAssetViaServer(input, fetchImpl),
      mode: "server",
    };
  }

  if (!response.ok) {
    return {
      hostedUrl: await uploadImageAssetViaServer(input, fetchImpl),
      mode: "server",
    };
  }

  return {
    hostedUrl: target.hostedUrl,
    mode: "direct",
  };
}

export async function uploadReferenceImageBlobToOss(
  input: UploadReferenceImageBlobInput,
): Promise<string> {
  const result = await uploadImageAsset({
    data: input.blob,
    contentType: input.blob.type || "image/png",
    fileName: input.fileName,
    folder: "references",
    fetchImpl: input.fetchImpl,
  });

  return result.hostedUrl;
}

async function createImageAssetUploadTarget(
  input: UploadImageAssetInput,
  fetchImpl: BrowserOssUploadFetch,
): Promise<BrowserOssUploadTarget> {
  const response = await fetchImpl("/api/image-hosting/upload-url", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contentType: input.contentType,
      fileName: input.fileName,
      folder: input.folder,
    }),
  });
  const json = (await response.json()) as
    | {
        ok: true;
        result: {
          uploadUrl: string;
          imageUrl: string;
          headers: Record<string, string>;
        };
      }
    | { ok: false; error: string };

  if (!response.ok || !json.ok) {
    throw new Error("error" in json ? json.error : "Failed to create image upload URL");
  }

  return {
    uploadUrl: json.result.uploadUrl,
    hostedUrl: json.result.imageUrl,
    headers: json.result.headers,
  };
}

async function uploadImageAssetViaServer(
  input: UploadImageAssetInput,
  fetchImpl: BrowserOssUploadFetch,
): Promise<string> {
  const formData = new FormData();
  formData.set("file", input.data);
  formData.set("contentType", input.contentType);
  formData.set("forceOss", "true");

  if (input.fileName) {
    formData.set("fileName", input.fileName);
  }

  if (input.folder) {
    formData.set("folder", input.folder);
  }

  const response = await fetchImpl("/api/image-hosting/upload", {
    method: "POST",
    body: formData,
  });
  const json = (await response.json()) as
    | { ok: true; result: { imageUrl: string } }
    | { ok: false; error: string };

  if (!response.ok || !json.ok) {
    throw new Error("error" in json ? json.error : `Image server upload failed (${response.status})`);
  }

  return json.result.imageUrl;
}
