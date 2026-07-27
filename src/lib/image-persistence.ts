export type PersistableImageReference = {
  imageUrl: string;
  hostedImageUrl?: string;
};

export function isTransientImageUrl(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized.startsWith("data:") || normalized.startsWith("blob:");
}

export function withStableHostedImage<
  T extends PersistableImageReference,
>(image: T, hostedImageUrl: string): T {
  const stableUrl = hostedImageUrl.trim();

  if (!stableUrl || isTransientImageUrl(stableUrl)) {
    throw new Error("Generated image hosting did not return a stable URL");
  }

  return {
    ...image,
    imageUrl: stableUrl,
    hostedImageUrl: stableUrl,
  } as T;
}

export function assertPersistableImageReferences(
  images: readonly PersistableImageReference[],
): void {
  for (const image of images) {
    if (
      !image.imageUrl.trim() ||
      isTransientImageUrl(image.imageUrl) ||
      (image.hostedImageUrl && isTransientImageUrl(image.hostedImageUrl))
    ) {
      throw new Error("Generated image result contains a transient URL");
    }
  }
}
