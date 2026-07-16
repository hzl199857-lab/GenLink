import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import type { AgentTaskAttachment } from "../types/agent";

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

const { mergeAgentAttachments } = require("./agent-attachments.ts") as typeof import("./agent-attachments");

function image(id: string, nodeId: string, url: string): AgentTaskAttachment {
  return {
    id,
    kind: "image",
    name: id,
    mimeType: "image/png",
    mediaUrl: url,
    imageUrl: url,
    previewUrl: url,
    status: "ready",
    sourceNodeId: nodeId,
  };
}

function video(id: string, nodeId: string, url: string): AgentTaskAttachment {
  return {
    id,
    kind: "video",
    name: id,
    mimeType: "video/mp4",
    mediaUrl: url,
    videoUrl: url,
    previewUrl: url,
    status: "ready",
    sourceNodeId: nodeId,
  };
}

test("merges an attachment batch in order and removes node and URL duplicates", () => {
  const existing = [image("image-a", "node-a", "https://cdn.example/a.png")];
  const result = mergeAgentAttachments(existing, [
    image("image-a-copy", "node-a", "https://cdn.example/a-copy.png"),
    video("video-b", "node-b", "https://cdn.example/b.mp4"),
    video("video-b-copy", "node-c", "https://cdn.example/b.mp4"),
    video("video-c", "node-d", "https://cdn.example/c.mp4"),
  ]);

  assert.deepEqual(result.attachments.map((item) => item.id), ["image-a", "video-b", "video-c"]);
  assert.equal(result.addedCount, 2);
  assert.equal(result.duplicateCount, 2);
});
