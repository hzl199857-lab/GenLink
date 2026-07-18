type ApiModelKind = "text" | "image" | "video";

const API_MODEL_KIND_LABELS: Record<ApiModelKind, string> = {
  text: "文本",
  image: "图像",
  video: "视频",
};

export function getMissingApiKeyErrorMessage(
  kind: ApiModelKind,
  providerLabel: string,
): string {
  return `请先在 API 设置中配置${API_MODEL_KIND_LABELS[kind]} ${providerLabel} 的 API Key。`;
}
