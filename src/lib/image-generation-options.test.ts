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

  (module as NodeModule & { _compile(source: string, filename: string): void })._compile(
    output.outputText,
    filename,
  );
};

const {
  DEFAULT_MIDJOURNEY_SETTINGS,
  getImageModelLabel,
  IMAGE_MODEL_OPTIONS_BY_PROVIDER,
  normalizeMidjourneySettings,
} = require("./image-generation-options.ts") as typeof import("./image-generation-options");

test("exposes gpt-image-2-all only for Comfly", () => {
  assert.ok(
    IMAGE_MODEL_OPTIONS_BY_PROVIDER.comfly.some((option) => option.id === "gpt-image-2-all"),
  );

  for (const provider of ["vibe", "fucheers", "zhenzhen", "runninghub", "grsai"] as const) {
    assert.ok(
      !IMAGE_MODEL_OPTIONS_BY_PROVIDER[provider].some((option) => option.id === "gpt-image-2-all"),
    );
  }
});

test("exposes Midjourney only for Comfly", () => {
  assert.deepEqual(
    IMAGE_MODEL_OPTIONS_BY_PROVIDER.comfly.find((option) => option.id === "midjourney"),
    { id: "midjourney", label: "Midjourney V8.1" },
  );

  for (const provider of ["vibe", "fucheers", "zhenzhen", "runninghub", "grsai"] as const) {
    assert.equal(
      IMAGE_MODEL_OPTIONS_BY_PROVIDER[provider].some((option) => option.id === "midjourney"),
      false,
    );
  }
});

test("shows the Midjourney V8.1 label for the selected model", () => {
  assert.equal(getImageModelLabel("midjourney"), "Midjourney V8.1");
});

test("uses beginner-friendly Midjourney defaults", () => {
  assert.deepEqual(DEFAULT_MIDJOURNEY_SETTINGS, {
    stylize: 100,
    weird: 0,
    chaos: 0,
    quality: 1,
  });
  assert.deepEqual(normalizeMidjourneySettings(), DEFAULT_MIDJOURNEY_SETTINGS);
});

test("normalizes Midjourney settings to supported ranges", () => {
  assert.deepEqual(
    normalizeMidjourneySettings({
      stylize: -12,
      weird: 9000,
      chaos: 101,
      quality: 2,
    }),
    { stylize: 0, weird: 3000, chaos: 100, quality: 2 },
  );

  assert.deepEqual(
    normalizeMidjourneySettings({
      stylize: 105.8,
      weird: Number.NaN,
      chaos: 10.7,
      quality: 7,
    } as unknown as Parameters<typeof normalizeMidjourneySettings>[0]),
    { stylize: 106, weird: 0, chaos: 11, quality: 1 },
  );
});
