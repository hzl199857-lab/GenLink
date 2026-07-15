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

test("all hosted image browser consumers use the display URL helper", () => {
  const browserImageConsumers = [
    "src/components/canvas/CanvasAgentPanel.tsx",
    "src/components/canvas/GenerationHistoryPopover.tsx",
    "src/components/canvas/InfiniteCanvas.tsx",
    "src/components/canvas/MaterialLibraryDialog.tsx",
    "src/components/canvas/MaterialLibraryPanel.tsx",
    "src/components/canvas/PromptLibraryDialog.tsx",
    "src/components/nodes/Panorama360Node.tsx",
    "src/components/nodes/ReferenceMediaStrip.tsx",
    "src/components/nodes/StoryboardGridNode.tsx",
    "src/components/nodes/StoryboardScriptNode.tsx",
    "src/components/nodes/ThreeViewController.tsx",
    "src/components/nodes/VideoPlayer.tsx",
    "src/components/director-desk/editor/canvas/ViewportBackground.tsx",
    "src/components/director-desk/editor/panels/ScenePanel.tsx",
    "src/store/canvas-store.ts",
  ];

  for (const fileName of browserImageConsumers) {
    const source = readFileSync(resolve(process.cwd(), fileName), "utf8");

    assert.match(
      source,
      /import \{ getBrowserImageDisplayUrl \} from ['"]@\/lib\/image-display-url['"]/,
      `${fileName} must import getBrowserImageDisplayUrl`,
    );
    assert.match(
      source,
      /getBrowserImageDisplayUrl\(/,
      `${fileName} must route hosted image reads through getBrowserImageDisplayUrl`,
    );
  }
});

test("generation history proxies image thumbnails without rewriting video sources", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/components/canvas/GenerationHistoryPopover.tsx"),
    "utf8",
  );

  assert.match(
    source,
    /<VideoPlayer\s+src=\{item\.previewUrl\}/,
  );
  assert.match(
    source,
    /<NextImage\s+src=\{getBrowserImageDisplayUrl\(item\.previewUrl\)\}/,
  );
});
