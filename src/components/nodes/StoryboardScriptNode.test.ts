import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('./StoryboardScriptNode.tsx', import.meta.url), 'utf8');

test('storyboard script node keeps its Chinese interface text readable', () => {
  for (const text of [
    '分镜脚本',
    '还没有分镜表',
    '图片提示词',
    '视频提示词',
    '列表视图',
    '卡片视图',
    '生成中...',
    '导出将在后续版本提供',
  ]) {
    assert.ok(source.includes(text), `missing readable interface text: ${text}`);
  }

  assert.doesNotMatch(source, /鍥剧墖|瑙嗛|鍒嗛暅|鐢熸垚|杩樻病|瀵煎嚭/);
});

test('storyboard reference labels use the same Chinese tokens as generated data', () => {
  assert.match(source, /const REFERENCE_PATTERN = \/@\(图片\|视频\)\(\\d\+\)\/g/);
  assert.match(source, /label: `@图片\$\{index \+ 1\}`/);
  assert.match(source, /label: `@视频\$\{index \+ 1\}`/);
});
