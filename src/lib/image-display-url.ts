const ALIYUN_OSS_DEFAULT_HOST_PATTERN =
  /^[a-z0-9][a-z0-9-]*\.oss-[a-z0-9-]+\.aliyuncs\.com$/i;

export function getBrowserImageDisplayUrl(imageUrl: string): string {
  if (!/^https?:\/\//i.test(imageUrl)) {
    return imageUrl;
  }

  try {
    const parsedUrl = new URL(imageUrl);

    if (!ALIYUN_OSS_DEFAULT_HOST_PATTERN.test(parsedUrl.hostname)) {
      return imageUrl;
    }

    return `/api/image-hosting/read?url=${encodeURIComponent(imageUrl)}`;
  } catch {
    return imageUrl;
  }
}

