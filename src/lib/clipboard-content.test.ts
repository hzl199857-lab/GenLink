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
  writeClipboardContent,
} = require("./clipboard-content.ts") as typeof import("./clipboard-content");

test("writes text clipboard content with writeText", async () => {
  const writes: string[] = [];

  await writeClipboardContent(
    { kind: "text", text: "hello" },
    {
      clipboard: {
        writeText: async (text) => {
          writes.push(text);
        },
        write: async () => {
          throw new Error("write should not be called for text");
        },
      },
    },
  );

  assert.deepEqual(writes, ["hello"]);
});

test("writes image clipboard content as image/png ClipboardItem", async () => {
  const pngBlob = new Blob(["png"], { type: "image/png" });
  const writes: unknown[][] = [];
  const itemInputs: Array<Record<string, Blob>> = [];

  class ClipboardItemStub {
    constructor(input: Record<string, Blob>) {
      itemInputs.push(input);
    }
  }

  await writeClipboardContent(
    { kind: "image", url: "https://cdn.example.com/image.png" },
    {
      ClipboardItem: ClipboardItemStub as unknown as typeof ClipboardItem,
      clipboard: {
        writeText: async () => {
          throw new Error("writeText should not be called for images");
        },
        write: async (items) => {
          writes.push(items);
        },
      },
      fetch: async (url) => {
        assert.equal(url, "https://cdn.example.com/image.png");

        return {
          ok: true,
          blob: async () => pngBlob,
        } as Response;
      },
    },
  );

  assert.equal(writes.length, 1);
  assert.equal(itemInputs.length, 1);
  assert.equal(itemInputs[0]?.["image/png"], pngBlob);
});

test("rejects image clipboard content when image clipboard APIs are unavailable", async () => {
  await assert.rejects(
    writeClipboardContent(
      { kind: "image", url: "https://cdn.example.com/image.png" },
      {
        clipboard: {
          writeText: async () => undefined,
        },
      },
    ),
    /当前环境不支持复制图片/,
  );
});
