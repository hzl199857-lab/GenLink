import type { ApiProvider } from "@/store/canvas-store";

export type ImageModelOption = {
  id: string;
  label: string;
};

export const IMAGE_MODELS = [
  { id: "gpt-image-2", label: "gpt-image-2" },
  { id: "nano-banana-2", label: "Nano banana pro" },
] as const satisfies readonly ImageModelOption[];

export const COMFLY_IMAGE_MODELS = [
  IMAGE_MODELS[0],
  { id: "gpt-image-2-all", label: "gpt-image-2-all" },
  IMAGE_MODELS[1],
] as const satisfies readonly ImageModelOption[];

export const RUNNING_HUB_IMAGE_MODELS = [
  { id: "gpt-image-2", label: "gpt-image-2" },
  { id: "nano-banana-pro", label: "Nano banana pro" },
  { id: "nano-banana-2", label: "Nano banana 2" },
] as const satisfies readonly ImageModelOption[];

export const GRSAI_IMAGE_MODELS = [
  { id: "gpt-image-2-vip", label: "gpt-image-2-vip" },
  { id: "nano-banana-pro", label: "Nano banana pro" },
] as const satisfies readonly ImageModelOption[];

export const RUNNING_HUB_CHANNEL_MODEL_IDS: ReadonlySet<string> = new Set(
  RUNNING_HUB_IMAGE_MODELS.map((model) => model.id),
);

export const RUNNING_HUB_NANO_MODEL_IDS: ReadonlySet<string> = new Set([
  "nano-banana-pro",
  "nano-banana-2",
]);

export const FIXED_IMAGE_FORMAT_MODEL_IDS: ReadonlySet<string> = new Set([
  "gpt-image-2",
]);

export const RUNNING_HUB_CHANNEL_OPTIONS = [
  { id: "official", label: "官方稳定版" },
  { id: "low-cost", label: "低价渠道版" },
] as const;

export type RunningHubChannel = typeof RUNNING_HUB_CHANNEL_OPTIONS[number]["id"];

export const API_PROVIDERS: ApiProvider[] = [
  "vibe",
  "fucheers",
  "comfly",
  "zhenzhen",
  "runninghub",
  "grsai",
];

export const IMAGE_MODEL_OPTIONS_BY_PROVIDER: Record<ApiProvider, readonly ImageModelOption[]> = {
  vibe: IMAGE_MODELS,
  fucheers: IMAGE_MODELS,
  comfly: COMFLY_IMAGE_MODELS,
  zhenzhen: IMAGE_MODELS,
  runninghub: RUNNING_HUB_IMAGE_MODELS,
  grsai: GRSAI_IMAGE_MODELS,
};

export const IMAGE_SIZE_OPTIONS = ["1K", "2K", "4K"] as const;

export const IMAGE_OUTPUT_FORMAT_OPTIONS = [
  { value: "png", label: "PNG" },
  { value: "jpeg", label: "JPEG" },
  { value: "webp", label: "WebP" },
] as const;

export const IMAGE_MODERATION_OPTIONS = [
  { value: "auto", label: "自动" },
  { value: "low", label: "低" },
] as const;

export const IMAGE_DETAIL_OPTIONS = [
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
] as const;

export const IMAGE_ASPECT_RATIO_LAYOUT = [
  { value: "auto", label: "自适应", className: "col-start-1 row-start-1 row-span-2 h-[109px]" },
  { value: "1:1", className: "col-start-2 row-start-1 h-[54px]" },
  { value: "4:3", className: "col-start-3 row-start-1 h-[54px]" },
  { value: "3:4", className: "col-start-4 row-start-1 h-[54px]" },
  { value: "5:4", className: "col-start-5 row-start-1 h-[54px]" },
  { value: "4:5", className: "col-start-2 row-start-2 h-[54px]" },
  { value: "3:2", className: "col-start-3 row-start-2 h-[54px]" },
  { value: "2:3", className: "col-start-4 row-start-2 h-[54px]" },
  { value: "16:9", className: "col-start-5 row-start-2 h-[54px]" },
  { value: "9:16", className: "col-start-2 row-start-3 h-[54px]" },
  { value: "2:1", className: "col-start-3 row-start-3 h-[54px]" },
  { value: "21:9", className: "col-start-4 row-start-3 h-[54px]" },
  { value: "9:21", className: "col-start-5 row-start-3 h-[54px]" },
] as const;

export const GEMINI_IMAGE_ASPECT_RATIO_LAYOUT = [
  { value: "1:1", className: "col-start-1 row-start-1 h-[54px]" },
  { value: "1:4", className: "col-start-2 row-start-1 h-[54px]" },
  { value: "1:8", className: "col-start-3 row-start-1 h-[54px]" },
  { value: "2:3", className: "col-start-4 row-start-1 h-[54px]" },
  { value: "3:2", className: "col-start-5 row-start-1 h-[54px]" },
  { value: "3:4", className: "col-start-1 row-start-2 h-[54px]" },
  { value: "4:1", className: "col-start-2 row-start-2 h-[54px]" },
  { value: "4:3", className: "col-start-3 row-start-2 h-[54px]" },
  { value: "4:5", className: "col-start-4 row-start-2 h-[54px]" },
  { value: "5:4", className: "col-start-5 row-start-2 h-[54px]" },
  { value: "8:1", className: "col-start-1 row-start-3 h-[54px]" },
  { value: "9:16", className: "col-start-2 row-start-3 h-[54px]" },
  { value: "16:9", className: "col-start-3 row-start-3 h-[54px]" },
  { value: "21:9", className: "col-start-4 row-start-3 h-[54px]" },
] as const;

export function getImageModelLabel(model: string): string {
  return (
    GRSAI_IMAGE_MODELS.find((option) => option.id === model)?.label ??
    RUNNING_HUB_IMAGE_MODELS.find((option) => option.id === model)?.label ??
    IMAGE_MODELS.find((option) => option.id === model)?.label ??
    model
  );
}

export function getRunningHubChannelLabel(channel?: RunningHubChannel): string {
  const resolvedChannel = channel === "low-cost" ? "low-cost" : "official";

  return RUNNING_HUB_CHANNEL_OPTIONS.find((option) => option.id === resolvedChannel)?.label ?? "官方稳定版";
}

export function isNanoBananaImageModel(
  provider: ApiProvider | undefined,
  model: string | undefined,
): boolean {
  if (!model) {
    return false;
  }

  if (provider === "runninghub") {
    return RUNNING_HUB_NANO_MODEL_IDS.has(model);
  }

  if (provider === "grsai") {
    return model === "nano-banana-pro";
  }

  return model.startsWith("nano-banana");
}

export function getAspectRatioLayoutForImageModel(
  provider: ApiProvider | undefined,
  model: string | undefined,
) {
  if (!isNanoBananaImageModel(provider, model)) {
    return IMAGE_ASPECT_RATIO_LAYOUT;
  }

  return provider === "grsai"
    ? IMAGE_ASPECT_RATIO_LAYOUT.filter((item) => (
      item.value !== "auto" && item.value !== "2:1" && item.value !== "9:21"
    ))
    : GEMINI_IMAGE_ASPECT_RATIO_LAYOUT;
}
