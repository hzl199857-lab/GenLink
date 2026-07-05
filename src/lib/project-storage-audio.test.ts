import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { test } from "node:test";

import type { AudioNodeData } from "@/types/canvas";

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

  (module as NodeModule & { _compile(source: string, filename: string): void })._compile(output.outputText, filename);
};

const {
  applyPersistedAudioPreview,
  inferExtension,
  inferOutputKind,
  withResolvedAudioNodePreviewUrl,
} = require("./project-storage.ts") as typeof import("./project-storage");

test("infers audio output kind from common audio mime types and extensions", () => {
  assert.equal(inferOutputKind("generated", "audio/mpeg"), "audio");
  assert.equal(inferOutputKind("generated.wav"), "audio");
  assert.equal(inferOutputKind("generated.m4a"), "audio");
});

test("infers stable audio file extensions from audio mime types", () => {
  assert.equal(inferExtension(undefined, "audio/mpeg"), "mp3");
  assert.equal(inferExtension(undefined, "audio/wav"), "wav");
  assert.equal(inferExtension(undefined, "audio/mp4"), "m4a");
});

test("keeps hosted audio URL when resolving a local preview URL", () => {
  const node = {
    id: "audio-1",
    type: "audio" as const,
    position: { x: 0, y: 0 },
    data: {
      title: "Reference",
      audioUrl: "output:reference.mp3",
      hostedAudioUrl: "https://oss.example.com/reference.mp3",
      outputFileName: "reference.mp3",
    },
  };

  const resolved = withResolvedAudioNodePreviewUrl(
    "blob:https://app.example.com/local-preview",
    "reference.mp3",
    node,
  );

  assert.equal(resolved.data.audioUrl, "blob:https://app.example.com/local-preview");
  assert.equal(resolved.data.previewUrl, "blob:https://app.example.com/local-preview");
  assert.equal(resolved.data.hostedAudioUrl, "https://oss.example.com/reference.mp3");
});

test("keeps remote hosted audio URL when applying a persisted local preview", () => {
  const nodeData: AudioNodeData = {
    title: "人声",
    audioUrl: "https://runninghub.example.com/vocal.mp3",
    hostedAudioUrl: "https://runninghub.example.com/vocal.mp3",
    fileName: "vocal",
  };
  const data = applyPersistedAudioPreview(
    nodeData,
    {
      previewUrl: "blob:https://app.example.com/vocal-preview",
      fileName: "2026-vocal.mp3",
      sizeBytes: 1234,
    },
  );

  assert.equal(data.audioUrl, "blob:https://app.example.com/vocal-preview");
  assert.equal(data.previewUrl, "blob:https://app.example.com/vocal-preview");
  assert.equal(data.hostedAudioUrl, "https://runninghub.example.com/vocal.mp3");
  assert.equal(data.outputFileName, "2026-vocal.mp3");
});
