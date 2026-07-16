import type {
  MaterialLibraryCategory,
  MaterialLibraryItem,
  PendingMaterialSource,
} from "@/types/canvas";

export type MaterialKind = "image" | "video" | "audio";

type MaterialTarget = {
  category: MaterialLibraryCategory;
  folderId?: string;
};

function clean(value?: string): string {
  return value?.trim() ?? "";
}

function isObjectUrl(value: string): boolean {
  return value.startsWith("blob:");
}

function firstUsableUrl(candidates: Array<string | undefined>): string {
  const urls = candidates.map(clean).filter(Boolean);
  return urls.find((url) => !isObjectUrl(url)) ?? urls[0] ?? "";
}

export function getMaterialKind(
  item: Pick<MaterialLibraryItem, "kind">,
): MaterialKind {
  return item.kind === "video" || item.kind === "audio" ? item.kind : "image";
}

export function getMaterialMediaUrl(
  item: Pick<
    MaterialLibraryItem,
    "kind" | "mediaUrl" | "hostedMediaUrl" | "previewUrl" | "imageUrl" | "hostedImageUrl"
  >,
): string {
  const kind = getMaterialKind(item);

  return kind === "image"
    ? firstUsableUrl([
        item.hostedMediaUrl,
        item.mediaUrl,
        item.hostedImageUrl,
        item.imageUrl,
        item.previewUrl,
      ])
    : firstUsableUrl([
        item.hostedMediaUrl,
        item.mediaUrl,
        item.previewUrl,
        item.hostedImageUrl,
        item.imageUrl,
      ]);
}

function materialLocationKey(item: MaterialTarget): string {
  return `${item.category}\u0000${item.folderId ?? ""}`;
}

function uniqueMaterialName(baseName: string, reservedNames: Set<string>): string {
  if (!reservedNames.has(baseName)) {
    reservedNames.add(baseName);
    return baseName;
  }

  let suffix = 2;
  let candidate = `${baseName} (${suffix})`;

  while (reservedNames.has(candidate)) {
    suffix += 1;
    candidate = `${baseName} (${suffix})`;
  }

  reservedNames.add(candidate);
  return candidate;
}

export function createMaterialItemsForTarget(
  sources: PendingMaterialSource[],
  target: MaterialTarget,
  existing: MaterialLibraryItem[],
): Array<Omit<MaterialLibraryItem, "id" | "createdAt">> {
  const targetLocation = materialLocationKey(target);
  const scopedExisting = existing.filter(
    (item) => materialLocationKey(item) === targetLocation,
  );
  const reservedNames = new Set(scopedExisting.map((item) => item.name.trim()));
  const existingByMediaUrl = new Map(
    scopedExisting
      .map((item) => [getMaterialMediaUrl(item), item] as const)
      .filter(([url]) => Boolean(url)),
  );

  return sources.map((source) => {
    const { defaultName, ...media } = source;
    const mediaUrl = getMaterialMediaUrl({
      ...media,
      imageUrl: media.imageUrl || media.mediaUrl || media.previewUrl || "",
    });
    const reused = mediaUrl ? existingByMediaUrl.get(mediaUrl) : undefined;
    const baseName = defaultName.trim() || "未命名素材";
    const name = reused?.name ?? uniqueMaterialName(baseName, reservedNames);
    const kind = getMaterialKind(media);

    return {
      ...media,
      ...target,
      kind,
      name,
      mediaUrl: media.mediaUrl || mediaUrl,
      imageUrl: media.imageUrl || mediaUrl,
    };
  });
}

export function sanitizeMaterialForPersistence(
  item: MaterialLibraryItem,
): MaterialLibraryItem {
  const kind = getMaterialKind(item);
  const outputFileName = clean(item.outputFileName);

  if (outputFileName) {
    const outputUrl = `output:${outputFileName}`;

    return {
      ...item,
      kind,
      mediaUrl: outputUrl,
      imageUrl: outputUrl,
      hostedMediaUrl: undefined,
      hostedImageUrl: undefined,
      previewUrl: undefined,
    };
  }

  const mediaUrl = getMaterialMediaUrl(item);
  const stableMediaUrl = isObjectUrl(mediaUrl) ? "" : mediaUrl;

  return {
    ...item,
    kind,
    mediaUrl: stableMediaUrl || undefined,
    imageUrl:
      !isObjectUrl(clean(item.imageUrl)) && clean(item.imageUrl)
        ? clean(item.imageUrl)
        : stableMediaUrl,
    hostedMediaUrl:
      item.hostedMediaUrl && !isObjectUrl(item.hostedMediaUrl)
        ? item.hostedMediaUrl
        : undefined,
    hostedImageUrl:
      item.hostedImageUrl && !isObjectUrl(item.hostedImageUrl)
        ? item.hostedImageUrl
        : undefined,
    previewUrl:
      item.previewUrl && !isObjectUrl(item.previewUrl)
        ? item.previewUrl
        : undefined,
  };
}
