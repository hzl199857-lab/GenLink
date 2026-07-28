import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const Module = require("node:module") as typeof import("node:module") & {
  _resolveFilename: (
    request: string,
    parent: NodeModule | undefined,
    isMain: boolean,
    options?: unknown,
  ) => string;
};
const ts = require("typescript");
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(
      this,
      path.join(process.cwd(), "src", request.slice(2)),
      parent,
      isMain,
      options,
    );
  }

  return originalResolveFilename.call(this, request, parent, isMain, options);
};

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

const {
  withResolvedImagePreviewUrl,
  withResolvedUploadedImagePreviewUrl,
} = require("./project-storage.ts") as typeof import("./project-storage");

test("replaces every stale local URL when hydrating a project-backed image", () => {
  const resolved = withResolvedImagePreviewUrl(
    "blob:fresh-project-preview",
    "reference.png",
    {
      id: "image-1",
      type: "image",
      position: { x: 0, y: 0 },
      data: {
        imageUrl: "output:reference.png",
        hostedImageUrl: "blob:stale-hosted-preview",
        previewUrl: "blob:stale-preview",
        prompt: "Reference",
        generatedAt: "2026-07-28T00:00:00.000Z",
        generatedOutputFileName: "reference.png",
      },
    },
  );

  assert.equal(resolved.data.imageUrl, "blob:fresh-project-preview");
  assert.equal(resolved.data.previewUrl, "blob:fresh-project-preview");
  assert.equal(resolved.data.hostedImageUrl, undefined);
});

test("keeps a stable remote original as fallback when hydrating an image preview", () => {
  const resolved = withResolvedUploadedImagePreviewUrl(
    "blob:fresh-project-preview",
    "upload.png",
    {
      id: "upload-1",
      type: "uploaded_image",
      position: { x: 0, y: 0 },
      data: {
        imageUrl: "output:upload.png",
        hostedImageUrl: "https://oss.example.com/upload.png",
        previewUrl: "blob:stale-preview",
        outputFileName: "upload.png",
        width: 1200,
        height: 800,
      },
    },
  );

  assert.equal(resolved.data.imageUrl, "blob:fresh-project-preview");
  assert.equal(resolved.data.previewUrl, "blob:fresh-project-preview");
  assert.equal(resolved.data.hostedImageUrl, "https://oss.example.com/upload.png");
});
