import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

import type { LayoutItem } from "./selection-layout";

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

  (module as NodeModule & { _compile(source: string, filename: string): void })._compile(
    output.outputText,
    filename,
  );
};

const { calculateNodeLayout } = require("./selection-layout.ts") as typeof import("./selection-layout");

const items: LayoutItem[] = [
  {
    id: "b",
    position: { x: 320, y: 20 },
    bounds: { x: 320, y: 20, width: 80, height: 100 },
  },
  {
    id: "a",
    position: { x: 20, y: 20 },
    bounds: { x: 20, y: 20, width: 120, height: 60 },
  },
  {
    id: "c",
    position: { x: 20, y: 240 },
    bounds: { x: 20, y: 240, width: 90, height: 70 },
  },
];

test("lays out nodes horizontally in stable canvas order", () => {
  assert.deepEqual(
    calculateNodeLayout(items, "horizontal", { x: 20, y: 20 }, { x: 48, y: 48 }),
    new Map([
      ["a", { x: 20, y: 20 }],
      ["b", { x: 188, y: 20 }],
      ["c", { x: 356, y: 20 }],
    ]),
  );
});

test("lays out nodes vertically using the tallest item", () => {
  assert.deepEqual(
    calculateNodeLayout(items, "vertical", { x: 20, y: 20 }, { x: 48, y: 48 }),
    new Map([
      ["a", { x: 20, y: 20 }],
      ["b", { x: 20, y: 168 }],
      ["c", { x: 20, y: 316 }],
    ]),
  );
});

test("lays out nodes in a square-root grid", () => {
  assert.deepEqual(
    calculateNodeLayout(items, "grid", { x: 20, y: 20 }, { x: 48, y: 48 }),
    new Map([
      ["a", { x: 20, y: 20 }],
      ["b", { x: 188, y: 20 }],
      ["c", { x: 20, y: 168 }],
    ]),
  );
});
