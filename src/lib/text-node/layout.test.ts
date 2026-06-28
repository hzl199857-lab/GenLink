import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");

require.extensions[".ts"] = (module: NodeModule, filename: string) => {
  const source = require("node:fs").readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      strict: true,
    },
    fileName: filename,
  });

  (module as NodeModule & { _compile(source: string, filename: string): void })._compile(output.outputText, filename);
};

const {
  TEXT_NODE_DEFAULT_CARD_HEIGHT,
  TEXT_NODE_DEFAULT_CARD_WIDTH,
  getTextNodeCardSize,
  normalizeTextNodeCardSize,
} = require("./layout.ts") as typeof import("./layout");

test("normalizes text node card size with default dimensions", () => {
  assert.deepEqual(normalizeTextNodeCardSize(undefined, undefined), {
    width: TEXT_NODE_DEFAULT_CARD_WIDTH,
    height: TEXT_NODE_DEFAULT_CARD_HEIGHT,
  });
});

test("clamps text node card size to the default minimum", () => {
  assert.deepEqual(normalizeTextNodeCardSize(120, 90), {
    width: TEXT_NODE_DEFAULT_CARD_WIDTH,
    height: TEXT_NODE_DEFAULT_CARD_HEIGHT,
  });
});

test("reads persisted text node card dimensions", () => {
  assert.deepEqual(getTextNodeCardSize({ cardWidth: 720, cardHeight: 420 }), {
    width: 720,
    height: 420,
  });
});
