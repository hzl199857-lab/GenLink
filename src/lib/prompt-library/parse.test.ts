import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

import type { PromptLibraryEntry } from "@/features/prompt-library/types";

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

  (module as NodeModule & { _compile(code: string, filename: string): void })._compile(
    output.outputText,
    filename,
  );
};

const {
  mergePromptLibraryEntries,
  sortPromptLibraryEntries,
} = require("./parse.ts") as typeof import("./parse");

const entry: PromptLibraryEntry = {
  id: "opennana-1",
  kind: "image",
  origin: "community",
  title: "OpenNana example",
  prompt: "Prompt body",
  excerpt: "Prompt body",
  category: "image prompt",
  source: "OpenNana",
  tags: ["image prompt"],
  createdAt: "2026-07-04T00:00:00.000Z",
  updatedAt: "2026-07-04T00:00:00.000Z",
};

test("deduplicates prompt library entries by id", () => {
  const merged = mergePromptLibraryEntries([
    entry,
    { ...entry, title: "Duplicate title" },
    { ...entry, id: "opennana-2" },
  ]);

  assert.equal(merged.length, 2);
  assert.equal(merged[0].title, "OpenNana example");
  assert.equal(merged[1].id, "opennana-2");
});

test("sorts entries by newest update and stable id tie-break", () => {
  const sorted = sortPromptLibraryEntries([
    { ...entry, id: "opennana-10", updatedAt: "2026-07-04T00:00:00.000Z" },
    { ...entry, id: "opennana-8", updatedAt: "2026-07-04T01:00:00.000Z" },
    { ...entry, id: "opennana-12", updatedAt: "2026-07-04T00:00:00.000Z" },
  ]);

  assert.deepEqual(
    sorted.map((item) => item.id),
    ["opennana-8", "opennana-12", "opennana-10"],
  );
});
