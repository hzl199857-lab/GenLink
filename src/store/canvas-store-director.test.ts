import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveFilename(
  request: string,
  parent: NodeModule | undefined,
  isMain: boolean,
  options: unknown,
) {
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

const transpileTypeScriptModule = (module: NodeModule, filename: string) => {
  const source = require("node:fs").readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      strict: true,
    },
    fileName: filename,
  });

  (module as NodeModule & { _compile(code: string, filename: string): void })._compile(
    output.outputText,
    filename,
  );
};

require.extensions[".ts"] = transpileTypeScriptModule;
require.extensions[".tsx"] = transpileTypeScriptModule;

const { useCanvasStore } = require("./canvas-store.ts") as typeof import("./canvas-store");

test("creates a canvas image from a director desk capture without removing the director node", async () => {
  useCanvasStore.getState().setActiveUserId("user-a");
  useCanvasStore.setState({
    nodes: [{
      id: "director-1",
      type: "director",
      position: { x: 100, y: 200 },
      data: { title: "导演台" },
    }],
    edges: [],
    groups: [],
    currentProject: null,
    currentProjectPreviewUrls: [],
    dirty: false,
    error: null,
    undoStack: [],
    redoStack: [],
  });

  const imageNodeId = await useCanvasStore.getState().createDirectorDeskCaptureNode("director-1", {
    dataUrl: "data:image/png;base64,abc",
    fileName: "机位02截图.png",
    width: 640,
    height: 360,
  });
  const nodes = useCanvasStore.getState().nodes;
  const directorNode = nodes.find((node) => node.id === "director-1");
  const imageNode = nodes.find((node) => node.id === imageNodeId);

  assert.equal(directorNode?.type, "director");
  assert.equal(imageNode?.type, "image");

  if (imageNode?.type !== "image") {
    assert.fail("Expected a created image node");
  }

  assert.equal(imageNode.data.title, "机位02截图");
  assert.equal(imageNode.data.imageUrl, "data:image/png;base64,abc");
  assert.equal(imageNode.data.width, 640);
  assert.equal(imageNode.data.height, 360);
  assert.equal(imageNode.data.sourceImageNodeId, "director-1");
  assert.equal(imageNode.position.x, 548);
  assert.equal(imageNode.position.y, 200);
});
