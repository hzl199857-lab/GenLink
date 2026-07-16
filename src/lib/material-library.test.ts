import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { MaterialLibraryItem, PendingMaterialSource } from "../types/canvas";

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

const {
  createMaterialItemsForTarget,
  getMaterialKind,
  getMaterialMediaUrl,
  sanitizeMaterialForPersistence,
} = require("./material-library.ts") as typeof import("./material-library");

const existing: MaterialLibraryItem[] = [
  {
    id: "existing-image",
    name: "产品",
    category: "人物",
    imageUrl: "https://cdn.example/product.png",
    hostedImageUrl: "https://cdn.example/product.png",
    createdAt: "2026-07-17T00:00:00.000Z",
  },
  {
    id: "existing-video",
    kind: "video",
    name: "广告",
    category: "人物",
    mediaUrl: "https://cdn.example/ad.mp4",
    hostedMediaUrl: "https://cdn.example/ad.mp4",
    imageUrl: "https://cdn.example/ad.mp4",
    createdAt: "2026-07-17T00:00:00.000Z",
  },
];

test("normalizes legacy image materials and resolves media URLs", () => {
  assert.equal(getMaterialKind(existing[0]), "image");
  assert.equal(getMaterialMediaUrl(existing[0]), "https://cdn.example/product.png");
  assert.equal(getMaterialKind(existing[1]), "video");
  assert.equal(getMaterialMediaUrl(existing[1]), "https://cdn.example/ad.mp4");
});

test("prepares batch names without overwriting different media", () => {
  const sources: PendingMaterialSource[] = [
    {
      defaultName: "广告",
      kind: "video",
      mediaUrl: "https://cdn.example/ad.mp4",
      imageUrl: "https://cdn.example/ad.mp4",
    },
    {
      defaultName: "广告",
      kind: "audio",
      mediaUrl: "https://cdn.example/voice.mp3",
      imageUrl: "https://cdn.example/voice.mp3",
    },
  ];

  const items = createMaterialItemsForTarget(sources, { category: "人物" }, existing);

  assert.equal(items[0]?.name, "广告");
  assert.equal(items[1]?.name, "广告 (2)");
  assert.equal(items[1]?.kind, "audio");
});

test("sanitizes output-backed media without persisting hosted preview URLs", () => {
  const video = sanitizeMaterialForPersistence({
    ...existing[1],
    outputFileName: "ad.mp4",
    previewUrl: "blob:preview",
  });

  assert.equal(video.mediaUrl, "output:ad.mp4");
  assert.equal(video.hostedMediaUrl, undefined);
  assert.equal(video.previewUrl, undefined);
});

test("canvas store exposes one atomic batch material action", () => {
  const storeSource = readFileSync(new URL("../store/canvas-store.ts", import.meta.url), "utf8");

  assert.match(storeSource, /addMaterials: \(/);
  assert.match(storeSource, /addMaterials: \(items\) => \{[\s\S]*?set\(\(state\) =>/);
});
