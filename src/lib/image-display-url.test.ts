import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
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

  (module as NodeModule & { _compile(source: string, filename: string): void })._compile(
    output.outputText,
    filename,
  );
};

const { getBrowserImageDisplayUrl } = require("./image-display-url.ts") as typeof import("./image-display-url");

test("routes Aliyun OSS default-domain images through the same-origin reader", () => {
  const sourceUrl =
    "https://genlink-img.oss-cn-guangzhou.aliyuncs.com/generated/2026-07-15/example.png?x-oss-process=image%2Fresize%2Cw_1200";

  assert.equal(
    getBrowserImageDisplayUrl(sourceUrl),
    `/api/image-hosting/read?url=${encodeURIComponent(sourceUrl)}`,
  );
});

test("preserves image URLs that do not use an Aliyun OSS default domain", () => {
  const values = [
    "blob:https://genlink.zerinnai.online/example",
    "data:image/png;base64,AAAA",
    "/api/image-hosting/file/example.png",
    "https://images.example.com/example.png",
    "not a url",
  ];

  for (const value of values) {
    assert.equal(getBrowserImageDisplayUrl(value), value);
  }
});

test("canvas uploaded and generated image nodes use the display URL helper", () => {
  const uploadedImageNode = readFileSync(
    resolve(process.cwd(), "src/components/nodes/UploadedImageNode.tsx"),
    "utf8",
  );
  const generatedImageNode = readFileSync(
    resolve(process.cwd(), "src/components/nodes/ImageGenerationNode.tsx"),
    "utf8",
  );

  for (const source of [uploadedImageNode, generatedImageNode]) {
    assert.match(
      source,
      /import \{ getBrowserImageDisplayUrl \} from ['"]@\/lib\/image-display-url['"]/,
    );
    assert.match(source, /getBrowserImageDisplayUrl\(/);
  }
});

test("image reference thumbnails and previews use the display URL helper", () => {
  const referenceRenderers = [
    "src/components/nodes/ImageGenerationPromptBar.tsx",
    "src/components/nodes/PromptMentionInput.tsx",
    "src/components/nodes/ReferenceImageHoverPreview.tsx",
  ].map((fileName) => readFileSync(resolve(process.cwd(), fileName), "utf8"));

  for (const source of referenceRenderers) {
    assert.match(
      source,
      /import \{ getBrowserImageDisplayUrl \} from ['"]@\/lib\/image-display-url['"]/,
    );
    assert.match(source, /getBrowserImageDisplayUrl\(/);
  }
});
