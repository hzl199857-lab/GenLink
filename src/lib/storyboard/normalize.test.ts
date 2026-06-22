import {
  STORYBOARD_ROW_FIELDS,
  normalizeStoryboardResponse,
} from './normalize';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

export function runStoryboardNormalizeTests(): void {
  const wrappedJson = [
    '```json',
    JSON.stringify({
      schemaVersion: 'storyboard-script.v1',
      type: 'storyboard-script',
      sourceMode: 'image',
      title: '测试分镜',
      detectedIntent: {
        shotCount: 1,
      },
      rows: [
        {
          镜号: 1,
          时长: '5s',
          图片提示词: '静态画面',
          视频提示词: '镜头缓推',
        },
      ],
    }),
    '```',
  ].join('\n');

  const normalized = normalizeStoryboardResponse(wrappedJson);

  assert(normalized.ok, 'wrapped JSON should normalize');
  assertEqual(normalized.data.schemaVersion, 'storyboard-script.v1', 'schema version');
  assertEqual(normalized.data.type, 'storyboard-script', 'response type');
  assertEqual(normalized.data.sourceMode, 'image', 'source mode');
  assertEqual(normalized.data.rows.length, 1, 'row count');
  assertEqual(normalized.data.rows[0]['镜号'], '1', 'numeric fields are stringified');
  assertEqual(normalized.data.rows[0]['图片提示词'], '静态画面', 'image prompt preserved');
  assertEqual(normalized.data.rows[0]['视频提示词'], '镜头缓推', 'video prompt preserved');

  for (const field of STORYBOARD_ROW_FIELDS) {
    assert(
      Object.prototype.hasOwnProperty.call(normalized.data.rows[0], field),
      `missing normalized field ${field}`,
    );
  }

  const invalid = normalizeStoryboardResponse('not json');
  assert(!invalid.ok, 'non-json output should fail');
  assertEqual(invalid.error, '分镜解析失败', 'parse error message');

  const emptyRows = normalizeStoryboardResponse(JSON.stringify({
    schemaVersion: 'storyboard-script.v1',
    type: 'storyboard-script',
    rows: [],
  }));
  assert(!emptyRows.ok, 'empty rows should fail');
  assertEqual(emptyRows.error, '分镜结果为空', 'empty rows error message');
}
