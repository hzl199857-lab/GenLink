import type {
  OpenClawPlanfEcomField,
} from "./planf-ecom-session";

const PROTECTED_PRESET_FIELD_IDS = new Set([
  "productName",
  "platform",
  "imageSet",
  "styleMode",
]);

const EXPLICIT_PLATFORM_PATTERNS: Array<[RegExp, string]> = [
  [/亚马逊|amazon/i, "amazon"],
  [/小红书|rednote|\bxhs\b/i, "xiaohongshu"],
  [/淘宝|天猫|taobao|tmall/i, "taobao"],
  [/京东|\bjd\b/i, "jd"],
  [/拼多多|\bpdd\b/i, "pdd"],
  [/抖音|douyin|tiktok/i, "douyin"],
  [/视频号|微信小店|weixin|wechat/i, "weixin"],
];

function inferExplicitPlatform(request: string): string | undefined {
  return EXPLICIT_PLATFORM_PATTERNS.find(([pattern]) => pattern.test(request))?.[1];
}

function mergeOptions(
  primary: Array<{ label: string; value: string }>,
  fallback: Array<{ label: string; value: string }>,
): Array<{ label: string; value: string }> {
  const options = new Map<string, { label: string; value: string }>();

  for (const option of [...fallback, ...primary]) {
    options.set(option.value, option);
  }

  return Array.from(options.values());
}

function mergeProtectedField(
  runtimeField: OpenClawPlanfEcomField,
  defaultField: OpenClawPlanfEcomField,
  value: string,
): OpenClawPlanfEcomField {
  if (runtimeField.type !== defaultField.type) {
    return defaultField;
  }

  if (runtimeField.type === "select" && defaultField.type === "select") {
    return {
      ...runtimeField,
      value,
      options: mergeOptions(defaultField.options, runtimeField.options),
    };
  }

  if (runtimeField.type === "text" && defaultField.type === "text") {
    return {
      ...runtimeField,
      value,
    };
  }

  return defaultField;
}

export function mergeEcomRuntimeFormFields(input: {
  request: string;
  defaultFields: OpenClawPlanfEcomField[];
  runtimeFields: OpenClawPlanfEcomField[];
}): OpenClawPlanfEcomField[] {
  const defaultsById = new Map(input.defaultFields.map((field) => [field.id, field]));
  const explicitPlatform = inferExplicitPlatform(input.request);
  const seen = new Set<string>();
  const merged = input.runtimeFields.map((runtimeField) => {
    seen.add(runtimeField.id);

    if (!PROTECTED_PRESET_FIELD_IDS.has(runtimeField.id)) {
      return runtimeField;
    }

    const defaultField = defaultsById.get(runtimeField.id);

    if (!defaultField || !("value" in defaultField) || typeof defaultField.value !== "string") {
      return runtimeField;
    }

    const value = runtimeField.id === "platform" && explicitPlatform
      ? explicitPlatform
      : defaultField.value;

    return mergeProtectedField(runtimeField, defaultField, value);
  });

  for (const defaultField of input.defaultFields) {
    if (!seen.has(defaultField.id)) {
      merged.push(defaultField);
    }
  }

  return merged;
}
