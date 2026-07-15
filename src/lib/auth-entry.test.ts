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

  (module as NodeModule & { _compile: (code: string, filename: string) => void })
    ._compile(output.outputText, filename);
};

const { getHomeEntryDecision } =
  require("./auth-entry.ts") as typeof import("./auth-entry");

test("keeps the home page on the hero when no app entry is requested", () => {
  assert.deepEqual(
    getHomeEntryDecision({ appParam: null, isAuthenticated: false }),
    { action: "show-hero" },
  );
});

test("keeps unauthenticated app entry requests on the hero", () => {
  assert.deepEqual(
    getHomeEntryDecision({ appParam: "library", isAuthenticated: false }),
    { action: "show-hero" },
  );
});

test("opens the project library for authenticated app entry requests", () => {
  assert.deepEqual(
    getHomeEntryDecision({ appParam: "library", isAuthenticated: true }),
    { action: "open-library" },
  );
});
