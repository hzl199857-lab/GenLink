const ALIYUN_OSS_DEFAULT_HOST_PATTERN =
  /^[a-z0-9][a-z0-9-]*\.oss-[a-z0-9-]+\.aliyuncs\.com$/i;

export interface ImageCdnConfig {
  cdnBaseUrl?: string;
  cdnSourceHost?: string;
}

const DEFAULT_IMAGE_CDN_CONFIG: ImageCdnConfig = {
  cdnBaseUrl: process.env.NEXT_PUBLIC_IMAGE_CDN_BASE_URL,
  cdnSourceHost: process.env.NEXT_PUBLIC_IMAGE_CDN_SOURCE_HOST,
};

function getImageCdnUrl(parsedUrl: URL, config: ImageCdnConfig): string | null {
  const sourceHost = config.cdnSourceHost?.trim().toLowerCase();
  const rawCdnBaseUrl = config.cdnBaseUrl?.trim();

  if (!sourceHost || !rawCdnBaseUrl || parsedUrl.hostname.toLowerCase() !== sourceHost) {
    return null;
  }

  try {
    const cdnUrl = new URL(rawCdnBaseUrl);

    if (!/^https?:$/.test(cdnUrl.protocol) || cdnUrl.username || cdnUrl.password) {
      return null;
    }

    cdnUrl.pathname = `${cdnUrl.pathname.replace(/\/+$/, "")}${parsedUrl.pathname}`;
    cdnUrl.search = parsedUrl.search;
    cdnUrl.hash = parsedUrl.hash;
    return cdnUrl.toString();
  } catch {
    return null;
  }
}

export function getBrowserImageDisplayUrl(
  imageUrl: string,
  config: ImageCdnConfig = DEFAULT_IMAGE_CDN_CONFIG,
): string {
  if (!/^https?:\/\//i.test(imageUrl)) {
    return imageUrl;
  }

  try {
    const parsedUrl = new URL(imageUrl);

    if (!ALIYUN_OSS_DEFAULT_HOST_PATTERN.test(parsedUrl.hostname)) {
      return imageUrl;
    }

    const cdnUrl = getImageCdnUrl(parsedUrl, config);
    if (cdnUrl) {
      return cdnUrl;
    }

    return `/api/image-hosting/read?url=${encodeURIComponent(imageUrl)}`;
  } catch {
    return imageUrl;
  }
}
