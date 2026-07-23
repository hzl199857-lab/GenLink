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

  (module as NodeModule & { _compile(source: string, filename: string): void })
    ._compile(output.outputText, filename);
};

const {
  CANVAS_NODE_CLIPBOARD_TEXT_MARKER,
  getClipboardImageFiles,
  isCanvasNodeClipboard,
  markCanvasNodeClipboard,
} = require("./clipboard-paste.ts") as typeof import("./clipboard-paste");

function createFile(name: string, type: string): File {
  return { name, type } as File;
}

function createClipboardData(initialData: Record<string, string> = {}): DataTransfer {
  const values = new Map(Object.entries(initialData));

  return {
    files: [],
    items: [],
    getData: (type: string) => values.get(type) ?? "",
    setData: (type: string, value: string) => {
      values.set(type, value);
    },
  } as unknown as DataTransfer;
}

test("marks and recognizes the system clipboard as GenLink node content", () => {
  const data = createClipboardData();

  assert.equal(markCanvasNodeClipboard(data), true);
  assert.equal(isCanvasNodeClipboard(data), true);
  assert.equal(data.getData("text/plain"), CANVAS_NODE_CLIPBOARD_TEXT_MARKER);
});

test("does not treat unrelated external clipboard content as GenLink nodes", () => {
  assert.equal(isCanvasNodeClipboard(createClipboardData({ "text/plain": "external text" })), false);
  assert.equal(isCanvasNodeClipboard(null), false);
});

test("reads copied webpage images from clipboard items", () => {
  const image = createFile("copied-image.png", "image/png");
  const data = {
    items: [
      { kind: "string", type: "text/html", getAsFile: () => null },
      { kind: "file", type: "image/png", getAsFile: () => image },
    ],
    files: [],
  } as unknown as DataTransfer;

  assert.deepEqual(getClipboardImageFiles(data), [image]);
});

test("falls back to clipboard files and ignores non-images", () => {
  const image = createFile("copied-image.webp", "image/webp");
  const text = createFile("notes.txt", "text/plain");
  const data = {
    items: [],
    files: [text, image],
  } as unknown as DataTransfer;

  assert.deepEqual(getClipboardImageFiles(data), [image]);
});
