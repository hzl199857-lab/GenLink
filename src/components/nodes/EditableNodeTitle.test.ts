import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");

require.extensions[".tsx"] = (module: NodeModule, filename: string) => {
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

const moduleLoader = require("node:module") as typeof import("node:module") & {
  _load: (
    request: string,
    parent: NodeModule | null,
    isMain: boolean,
  ) => unknown;
};
const originalLoad = moduleLoader._load;

moduleLoader._load = function loadWithTooltipStub(request, parent, isMain) {
  if (request === "@/components/ui/Tooltip") {
    return { Tooltip: () => null };
  }

  return originalLoad.apply(this, [request, parent, isMain]);
};

const {
  getEditableNodeTitleInputClassName,
} = require("./EditableNodeTitle.tsx") as typeof import("./EditableNodeTitle");

test("editable node title input remains interactive inside pointer-events-none node headers", () => {
  const className = getEditableNodeTitleInputClassName(
    "h-[46px] rounded-lg border border-blue-500",
  );

  assert.match(className, /(?:^|\s)pointer-events-auto(?:\s|$)/);
  assert.match(className, /(?:^|\s)h-\[46px\](?:\s|$)/);
  assert.match(className, /(?:^|\s)border-blue-500(?:\s|$)/);
});
