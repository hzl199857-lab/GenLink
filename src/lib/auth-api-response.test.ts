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

test("reads a JSON authentication response", async () => {
  const { readAuthApiResponse } = require("./auth-api-response.ts") as typeof import("./auth-api-response");
  const response = new Response(JSON.stringify({ ok: true, devCode: "123456" }), {
    headers: { "Content-Type": "application/json" },
  });

  assert.deepEqual(await readAuthApiResponse(response), {
    ok: true,
    devCode: "123456",
  });
});

test("treats an empty authentication response as a failed operation", async () => {
  const { readAuthApiResponse } = require("./auth-api-response.ts") as typeof import("./auth-api-response");

  assert.deepEqual(await readAuthApiResponse(new Response(null, { status: 500 })), {});
});

test("treats a non-JSON authentication response as a failed operation", async () => {
  const { readAuthApiResponse } = require("./auth-api-response.ts") as typeof import("./auth-api-response");

  assert.deepEqual(
    await readAuthApiResponse(new Response("Internal Server Error", { status: 500 })),
    {},
  );
});
