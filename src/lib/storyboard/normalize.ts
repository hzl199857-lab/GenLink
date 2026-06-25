export const STORYBOARD_SCHEMA_VERSION = 'storyboard-script.v1';
export const STORYBOARD_TYPE = 'storyboard-script';

export const STORYBOARD_ROW_FIELDS = [
  '镜号',
  '时长',
  '景别',
  '场景',
  '画面描述',
  '角色',
  '角色描述',
  '角色动作',
  '情绪',
  '角色图',
  '参考',
  '图片提示词',
  '视频提示词',
  '对白',
  '音效',
] as const;

export type StoryboardRowField = (typeof STORYBOARD_ROW_FIELDS)[number];

export type StoryboardRow = Record<StoryboardRowField, string>;

export type StoryboardSourceMode = 'text' | 'image' | 'video' | 'multimodal';

export interface NormalizedStoryboardData {
  schemaVersion: typeof STORYBOARD_SCHEMA_VERSION;
  type: typeof STORYBOARD_TYPE;
  sourceMode: StoryboardSourceMode;
  title: string;
  detectedIntent: {
    shotCount: number;
    totalDurationSeconds?: number;
    aspectRatio?: string;
    style?: string;
    language?: string;
  };
  rows: StoryboardRow[];
}

export type NormalizeStoryboardResult =
  | {
      ok: true;
      data: NormalizedStoryboardData;
      rawJson: string;
    }
  | {
      ok: false;
      error: string;
      detail?: string;
    };

export function isStoryboardRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringifyCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return JSON.stringify(value);
}

export function normalizeStoryboardRow(value: unknown): StoryboardRow {
  const record = isStoryboardRecord(value) ? value : {};

  return STORYBOARD_ROW_FIELDS.reduce((row, field) => {
    row[field] = stringifyCellValue(record[field]).trim();
    return row;
  }, {} as StoryboardRow);
}

function normalizeSourceMode(value: unknown): StoryboardSourceMode {
  if (value === 'image' || value === 'video' || value === 'multimodal') {
    return value;
  }

  return 'text';
}

function normalizeDetectedIntent(value: unknown, rowCount: number): NormalizedStoryboardData['detectedIntent'] {
  const record = isStoryboardRecord(value) ? value : {};
  const shotCount =
    typeof record.shotCount === 'number' && Number.isFinite(record.shotCount)
      ? record.shotCount
      : rowCount;
  const detectedIntent: NormalizedStoryboardData['detectedIntent'] = {
    shotCount,
  };

  if (typeof record.totalDurationSeconds === 'number' && Number.isFinite(record.totalDurationSeconds)) {
    detectedIntent.totalDurationSeconds = record.totalDurationSeconds;
  }
  if (typeof record.aspectRatio === 'string') {
    detectedIntent.aspectRatio = record.aspectRatio;
  }
  if (typeof record.style === 'string') {
    detectedIntent.style = record.style;
  }
  if (typeof record.language === 'string') {
    detectedIntent.language = record.language;
  }

  return detectedIntent;
}

export function extractJsonObject(input: string): string | null {
  const trimmed = input.trim();

  if (!trimmed) {
    return null;
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fencedMatch?.[1]?.trim() || trimmed;
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');

  if (firstBrace < 0 || lastBrace <= firstBrace) {
    return null;
  }

  return candidate.slice(firstBrace, lastBrace + 1);
}

export function normalizeStoryboardResponse(input: string): NormalizeStoryboardResult {
  const rawJson = extractJsonObject(input);

  if (!rawJson) {
    return {
      ok: false,
      error: '分镜解析失败',
      detail: '模型没有返回可解析的 JSON 对象',
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (error) {
    return {
      ok: false,
      error: '分镜解析失败',
      detail: error instanceof Error ? error.message : 'JSON.parse failed',
    };
  }

  if (!isStoryboardRecord(parsed)) {
    return {
      ok: false,
      error: '分镜解析失败',
      detail: 'JSON 顶层必须是对象',
    };
  }

  if (!Array.isArray(parsed.rows)) {
    return {
      ok: false,
      error: '分镜解析失败',
      detail: '缺少 rows 数组',
    };
  }

  if (parsed.rows.length === 0) {
    return {
      ok: false,
      error: '分镜结果为空',
      detail: 'rows 数组为空',
    };
  }

  const rows = parsed.rows.map(normalizeStoryboardRow);

  return {
    ok: true,
    rawJson,
    data: {
      schemaVersion: STORYBOARD_SCHEMA_VERSION,
      type: STORYBOARD_TYPE,
      sourceMode: normalizeSourceMode(parsed.sourceMode),
      title: typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim() : '分镜脚本',
      detectedIntent: normalizeDetectedIntent(parsed.detectedIntent, rows.length),
      rows,
    },
  };
}
