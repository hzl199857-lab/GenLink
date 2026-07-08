import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");

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

  (module as NodeModule & { _compile: (code: string, filename: string) => void })
    ._compile(output.outputText, filename);
};

require.extensions[".ts"] = transpileTypeScriptModule;
require.extensions[".tsx"] = transpileTypeScriptModule;

const {
  clearDirectorDeskCaptureHandler,
  postDirectorDeskCapturesToHost,
  setDirectorDeskCaptureHandler,
} = require("./hostBridge.ts") as typeof import("./hostBridge");

test("routes director desk captures through the internal canvas handler when registered", () => {
  const received: Array<{ dataUrl: string; fileName: string }>[] = [];

  setDirectorDeskCaptureHandler((captures) => {
    received.push(captures);
  });

  try {
    postDirectorDeskCapturesToHost([
      { dataUrl: " data:image/png;base64,abc ", fileName: "" },
      { dataUrl: "   ", fileName: "empty.png" },
    ]);
  } finally {
    clearDirectorDeskCaptureHandler();
  }

  assert.deepEqual(received, [[{
    dataUrl: "data:image/png;base64,abc",
    fileName: "director-desk-capture-1.png",
  }]]);
});
