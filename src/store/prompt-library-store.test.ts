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

const { createPromptLibraryState } = require("./prompt-library-store.ts") as typeof import("./prompt-library-store");

const entry: PromptLibraryEntry = {
  id: "opennana-1",
  kind: "image",
  origin: "community",
  title: "OpenNana 示例",
  prompt: "Prompt body",
  excerpt: "Prompt body",
  category: "图像提示词",
  source: "OpenNana",
  tags: ["图像提示词"],
  createdAt: "2026-07-04T00:00:00.000Z",
  updatedAt: "2026-07-04T00:00:00.000Z",
};

test("toggles favorite prompts", () => {
  const state = createPromptLibraryState();

  state.toggleFavorite(entry);
  assert.equal(Boolean(state.favoritePrompts[entry.id]), true);

  state.toggleFavorite(entry);
  assert.equal(Boolean(state.favoritePrompts[entry.id]), false);
});

test("updates community cache", () => {
  const state = createPromptLibraryState();
  state.setCommunityCache([entry], "2026-07-04T01:00:00.000Z");

  assert.equal(state.communityPrompts.length, 1);
  assert.equal(state.communityPrompts[0].id, "opennana-1");
  assert.equal(state.communityFetchedAt, "2026-07-04T01:00:00.000Z");
});
