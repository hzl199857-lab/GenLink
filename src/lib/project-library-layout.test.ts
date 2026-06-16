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

const {
  PROJECT_LIBRARY_CARD_WIDTH,
  PROJECT_LIBRARY_CARD_HEIGHT,
  PROJECT_LIBRARY_CARD_PADDING,
  PROJECT_LIBRARY_MEDIA_WIDTH,
  PROJECT_LIBRARY_THUMBNAIL_HEIGHT,
  projectLibraryCardClassName,
  projectLibraryCardSurfaceStyle,
  projectLibraryCardStyle,
  projectLibraryThumbnailStyle,
} = require("./project-library-layout.ts") as typeof import("./project-library-layout");

test("project library thumbnails use a 3:4 width-to-height ratio", () => {
  assert.equal(PROJECT_LIBRARY_CARD_WIDTH, 220);
  assert.equal(PROJECT_LIBRARY_CARD_PADDING, 8);
  assert.equal(PROJECT_LIBRARY_MEDIA_WIDTH, PROJECT_LIBRARY_CARD_WIDTH - PROJECT_LIBRARY_CARD_PADDING * 2);
  assert.equal(PROJECT_LIBRARY_THUMBNAIL_HEIGHT, Math.round((PROJECT_LIBRARY_MEDIA_WIDTH * 4) / 3));
  assert.equal(PROJECT_LIBRARY_CARD_HEIGHT, 351);
  assert.deepEqual(projectLibraryCardStyle, {
    width: PROJECT_LIBRARY_CARD_WIDTH,
    height: PROJECT_LIBRARY_CARD_HEIGHT,
  });
  assert.deepEqual(projectLibraryCardSurfaceStyle, {
    backgroundColor: "#15171a",
    boxShadow:
      "0 0 0 1px rgba(255,255,255,0.16), 0 18px 42px rgba(0,0,0,0.38)",
  });
  assert.deepEqual(projectLibraryThumbnailStyle, {
    width: "100%",
    height: PROJECT_LIBRARY_THUMBNAIL_HEIGHT,
  });
});

test("project cards share the create-project outer card style", () => {
  assert.equal(
    projectLibraryCardClassName,
    "rounded-gl-xl p-2 text-left transition duration-150 hover:-translate-y-0.5",
  );
});
