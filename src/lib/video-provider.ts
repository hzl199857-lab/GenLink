export type VideoGenerationProvider = "comfly" | "zhenzhen";

export type VideoProviderConfig = {
  id: VideoGenerationProvider;
  label: string;
  baseUrl: string;
};

export const VIDEO_PROVIDER_CONFIGS: Record<VideoGenerationProvider, VideoProviderConfig> = {
  comfly: {
    id: "comfly",
    label: "Comfly",
    baseUrl: "https://ai.comfly.org",
  },
  zhenzhen: {
    id: "zhenzhen",
    label: "贞贞AI工坊",
    baseUrl: "https://ai.t8star.org",
  },
};

export function normalizeVideoProvider(value?: unknown): VideoGenerationProvider {
  return value === "zhenzhen" ? "zhenzhen" : "comfly";
}

export function getVideoProviderConfig(provider?: unknown): VideoProviderConfig {
  return VIDEO_PROVIDER_CONFIGS[normalizeVideoProvider(provider)];
}
