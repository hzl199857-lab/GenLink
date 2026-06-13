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

const { dbToSnapshot } = require("./project-mapper.ts") as typeof import("./project-mapper");

test("maps legacy uploaded_image db nodes into image nodes with hosted asset fields", () => {
  const snapshot = dbToSnapshot(
    {
      id: "project-1",
      name: "Project",
      createdAt: new Date("2026-06-13T08:00:00.000Z"),
      updatedAt: new Date("2026-06-13T09:00:00.000Z"),
    },
    [
      {
        id: "node-1",
        projectId: "project-1",
        type: "uploaded_image",
        positionX: 10,
        positionY: 20,
        data: JSON.stringify({
          title: "Reference",
          imageUrl: "blob:old-local",
          hostedImageUrl: "https://oss.example.com/references/original.png",
          previewUrl: "https://oss.example.com/references/previews/preview.jpg",
          semanticImageUrl: "https://oss.example.com/references/semantic/semantic.jpg",
          fileName: "reference.png",
          outputFileName: "output/reference.png",
          width: 3840,
          height: 2160,
          displayWidth: 420,
          displayHeight: 236,
          sizeBytes: 1234567,
        }),
        createdAt: new Date("2026-06-13T08:30:00.000Z"),
        updatedAt: new Date("2026-06-13T08:40:00.000Z"),
      },
    ],
    [],
  );

  assert.equal(snapshot.nodes[0].type, "image");
  assert.deepEqual(snapshot.nodes[0], {
    id: "node-1",
    type: "image",
    position: { x: 10, y: 20 },
    data: {
      title: "Reference",
      imageUrl: "https://oss.example.com/references/original.png",
      hostedImageUrl: "https://oss.example.com/references/original.png",
      previewUrl: "https://oss.example.com/references/previews/preview.jpg",
      semanticImageUrl: "https://oss.example.com/references/semantic/semantic.jpg",
      fileName: "reference.png",
      generatedOutputFileName: "output/reference.png",
      prompt: "reference.png",
      model: undefined,
      width: 3840,
      height: 2160,
      displayWidth: 420,
      displayHeight: 236,
      sizeBytes: 1234567,
      generatedAt: new Date(0).toISOString(),
    },
  });
});
