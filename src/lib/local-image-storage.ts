import path from "node:path";

export const LOCAL_IMAGE_ROUTE_PREFIX = "/api/image-hosting/file";

export function getLocalImageDirectory(): string {
  return path.resolve(process.cwd(), "img");
}

export function getLocalImageFileNameFromUrl(imageUrl: string): string | null {
  const trimmedUrl = imageUrl.trim();
  let pathname = trimmedUrl;

  if (/^https?:\/\//i.test(trimmedUrl)) {
    try {
      pathname = new URL(trimmedUrl).pathname;
    } catch {
      return null;
    }
  }

  const routePrefix = `${LOCAL_IMAGE_ROUTE_PREFIX}/`;

  if (!pathname.startsWith(routePrefix)) {
    return null;
  }

  const encodedFileName = pathname.slice(routePrefix.length);
  const decodedFileName = decodeURIComponent(encodedFileName);

  if (
    !decodedFileName ||
    decodedFileName.includes("/") ||
    decodedFileName.includes("\\")
  ) {
    return null;
  }

  return decodedFileName;
}
