import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');

require.extensions['.ts'] = (module: NodeModule, filename: string) => {
  const source = require('node:fs').readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      strict: true,
    },
    fileName: filename,
  });

  (module as NodeModule & { _compile(source: string, filename: string): void })
    ._compile(output.outputText, filename);
};

const { shouldFocusNodeOnDoubleClick } = require('./node-double-click.ts') as typeof import('./node-double-click');

test('does not focus text nodes after a double click', () => {
  assert.equal(shouldFocusNodeOnDoubleClick('text'), false);
});

test('keeps double-click focus for other node types', () => {
  assert.equal(shouldFocusNodeOnDoubleClick('image'), true);
});
