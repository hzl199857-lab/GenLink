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

const { dbToSnapshot, snapshotToDb } = require("./project-mapper.ts") as typeof import("./project-mapper");

test("normalizes text node card dimensions from persisted data", () => {
  const snapshot = dbToSnapshot(
    {
      id: "project-1",
      name: "Project",
      createdAt: new Date("2026-06-13T08:00:00.000Z"),
      updatedAt: new Date("2026-06-13T09:00:00.000Z"),
    },
    [
      {
        id: "text-1",
        projectId: "project-1",
        type: "text",
        positionX: 10,
        positionY: 20,
        data: JSON.stringify({
          text: "Prompt",
          title: "Resizable prompt",
          cardWidth: 760,
          cardHeight: 480,
        }),
        createdAt: new Date("2026-06-13T08:30:00.000Z"),
        updatedAt: new Date("2026-06-13T08:40:00.000Z"),
      },
    ],
    [],
  );

  assert.deepEqual(snapshot.nodes[0], {
    id: "text-1",
    type: "text",
    position: { x: 10, y: 20 },
    data: {
      text: "Prompt",
      title: "Resizable prompt",
      cardWidth: 760,
      cardHeight: 480,
    },
  });
});

test("adds default text node card dimensions for legacy persisted data", () => {
  const snapshot = dbToSnapshot(
    {
      id: "project-1",
      name: "Project",
      createdAt: new Date("2026-06-13T08:00:00.000Z"),
      updatedAt: new Date("2026-06-13T09:00:00.000Z"),
    },
    [
      {
        id: "text-1",
        projectId: "project-1",
        type: "text",
        positionX: 10,
        positionY: 20,
        data: JSON.stringify({
          text: "Prompt",
        }),
        createdAt: new Date("2026-06-13T08:30:00.000Z"),
        updatedAt: new Date("2026-06-13T08:40:00.000Z"),
      },
    ],
    [],
  );

  assert.equal(snapshot.nodes[0].type, "text");
  assert.equal(snapshot.nodes[0].data.cardWidth, 511);
  assert.equal(snapshot.nodes[0].data.cardHeight, 289);
});

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

test("maps nodes and edges through their owning canvas", () => {
  const project = {
    id: "project-1",
    name: "Project",
    createdAt: new Date("2026-07-19T08:00:00.000Z"),
    updatedAt: new Date("2026-07-19T09:00:00.000Z"),
  };
  const canvas = {
    id: "canvas-2",
    projectId: project.id,
    name: "画布 2",
    position: 1,
    viewport: JSON.stringify({ x: 12, y: 24, zoom: 0.8 }),
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
  const snapshot = dbToSnapshot(
    project,
    [
      {
        id: "node-1",
        projectId: project.id,
        canvasId: "canvas-1",
        type: "text",
        positionX: 0,
        positionY: 0,
        data: JSON.stringify({ text: "other" }),
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      },
      {
        id: "node-2",
        projectId: project.id,
        canvasId: canvas.id,
        type: "text",
        positionX: 10,
        positionY: 20,
        data: JSON.stringify({ text: "active" }),
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      },
    ],
    [{
      id: "edge-2",
      projectId: project.id,
      canvasId: canvas.id,
      source: "node-2",
      target: "node-2",
      sourceHandle: null,
      targetHandle: null,
      createdAt: project.createdAt,
    }],
    canvas,
  );

  assert.equal(snapshot.activeCanvasId, canvas.id);
  assert.deepEqual(snapshot.nodes.map((node) => node.id), ["node-2"]);
  assert.deepEqual(snapshot.viewport, { x: 12, y: 24, zoom: 0.8 });

  const persisted = snapshotToDb(snapshot);
  assert.equal(persisted.canvas.id, canvas.id);
  assert.equal(persisted.nodes[0]?.canvasId, canvas.id);
  assert.equal(persisted.edges[0]?.canvasId, canvas.id);
});
