import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import type { StoredApiSettings } from "../store/canvas-store";

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

const { hasAgentApiCredential, resolveAgentApiCredential } =
  require("./agent-api-key.ts") as typeof import("./agent-api-key");

function createSettings(
  overrides: Partial<StoredApiSettings> = {},
): StoredApiSettings {
  const emptyKeys: StoredApiSettings["textApiKeys"] = {
    vibe: "",
    fucheers: "",
    comfly: "",
    zhenzhen: "",
    runninghub: "",
    grsai: "",
  };

  return {
    textProvider: "comfly",
    imageProvider: "comfly",
    textApiKeys: { ...emptyKeys },
    imageApiKeys: { ...emptyKeys },
    runningHubWorkflowApiKey: "",
    ...overrides,
  };
}

test("prefers the requested Agent provider credential", () => {
  const settings = createSettings({
    textApiKeys: {
      ...createSettings().textApiKeys,
      comfly: " comfly-key ",
      zhenzhen: "zhenzhen-key",
    },
  });

  assert.deepEqual(resolveAgentApiCredential(settings, "comfly", "gemini-3.5-flash"), {
    provider: "comfly",
    apiKey: "comfly-key",
  });
});

test("falls back to another supported Agent provider", () => {
  const settings = createSettings({
    textProvider: "zhenzhen",
    textApiKeys: {
      ...createSettings().textApiKeys,
      zhenzhen: "zhenzhen-key",
    },
  });

  assert.deepEqual(resolveAgentApiCredential(settings, "comfly", "gemini-3.1-pro"), {
    provider: "zhenzhen",
    apiKey: "zhenzhen-key",
  });
});

test("accepts a legacy image-only key for an Agent provider", () => {
  const settings = createSettings({
    imageApiKeys: {
      ...createSettings().imageApiKeys,
      comfly: "image-comfly-key",
    },
  });

  assert.deepEqual(resolveAgentApiCredential(settings, "comfly", "gemini-3.5-flash"), {
    provider: "comfly",
    apiKey: "image-comfly-key",
  });
});

test("reports when no Agent credential is configured", () => {
  const settings = createSettings({
    textProvider: "vibe",
    imageProvider: "runninghub",
  });

  assert.equal(resolveAgentApiCredential(settings, "comfly", "gemini-3.5-flash"), null);
  assert.equal(hasAgentApiCredential(settings, "comfly", "gemini-3.5-flash"), false);
});

test("keeps the selected legacy Provider for GPT models", () => {
  const settings = createSettings({
    textProvider: "comfly",
    textApiKeys: {
      ...createSettings().textApiKeys,
      vibe: "vibe-key",
      comfly: "comfly-key",
    },
  });

  assert.deepEqual(resolveAgentApiCredential(settings, "vibe", "gpt-5.5"), {
    provider: "vibe",
    apiKey: "vibe-key",
  });
});

test("skips GPT-only Provider credentials for Gemini models", () => {
  const settings = createSettings({
    textProvider: "vibe",
    textApiKeys: {
      ...createSettings().textApiKeys,
      vibe: "vibe-key",
      comfly: "comfly-key",
    },
  });

  assert.deepEqual(resolveAgentApiCredential(settings, "vibe", "gemini-3.5-flash"), {
    provider: "comfly",
    apiKey: "comfly-key",
  });
});

test("does not report a GPT-only key as usable for Gemini", () => {
  const settings = createSettings({
    textProvider: "vibe",
    imageProvider: "runninghub",
    textApiKeys: {
      ...createSettings().textApiKeys,
      vibe: "vibe-key",
    },
  });

  assert.equal(
    hasAgentApiCredential(settings, "comfly", "gemini-3.5-flash"),
    false,
  );
});
