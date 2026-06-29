import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";

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
  getVideoProviderConfig,
  normalizeVideoProvider,
  VIDEO_PROVIDER_CONFIGS,
} = require("./video-provider.ts") as typeof import("./video-provider");
const {
  buildVideoCreateRequest,
  buildVideoTaskResultRequestPath,
} = require("./video-request.ts") as typeof import("./video-request");

describe("video provider config", () => {
  it("uses the existing zhenzhen provider name and base URL", () => {
    assert.equal(VIDEO_PROVIDER_CONFIGS.zhenzhen.label, "贞贞AI工坊");
    assert.equal(getVideoProviderConfig("zhenzhen").baseUrl, "https://ai.t8star.org");
  });

  it("normalizes unsupported video providers to comfly", () => {
    assert.equal(normalizeVideoProvider("zhenzhen"), "zhenzhen");
    assert.equal(normalizeVideoProvider("runninghub"), "comfly");
    assert.equal(normalizeVideoProvider(undefined), "comfly");
  });

  it("uses the unified video API for zhenzhen text-to-video requests", () => {
    const request = buildVideoCreateRequest({
      provider: "zhenzhen",
      mode: "text-to-video",
      prompt: "city timelapse",
      model: "doubao-seedance-2-0-260128",
      ratio: "16:9",
      resolution: "720p",
      duration: 5,
      generateAudio: true,
    });

    assert.equal(request.path, "/v2/videos/generations");
    assert.equal(request.officialFormat, false);
    assert.equal(request.body.prompt, "city timelapse");
    assert.equal(request.body.model, "doubao-seedance-2-0-260128");
    assert.equal(request.body.ratio, "16:9");
    assert.equal(request.body.resolution, "720p");
    assert.equal(request.body.generate_audio, true);
  });

  it("passes zhenzhen reference media through unified API fields", () => {
    const request = buildVideoCreateRequest({
      provider: "zhenzhen",
      mode: "all-reference",
      prompt: "match the references",
      model: "doubao-seedance-2-0-fast-260128",
      images: [{ url: "https://example.com/image.png" }],
      videos: [{ url: "https://example.com/video.mp4" }],
      audio: [{ url: "https://example.com/audio.mp3" }],
    });

    assert.equal(request.path, "/v2/videos/generations");
    assert.deepEqual(request.body.images, ["https://example.com/image.png"]);
    assert.deepEqual(request.body.videos, ["https://example.com/video.mp4"]);
    assert.deepEqual(request.body.audio, ["https://example.com/audio.mp3"]);
  });

  it("keeps comfly official format routing for reference-video requests", () => {
    const request = buildVideoCreateRequest({
      provider: "comfly",
      mode: "all-reference",
      prompt: "match the reference video",
      videos: [{ url: "https://example.com/video.mp4" }],
    });

    assert.equal(request.path, "/seedance/v3/contents/generations/tasks");
    assert.equal(request.officialFormat, true);
  });

  it("uses the unified status path for zhenzhen task polling", () => {
    assert.equal(
      buildVideoTaskResultRequestPath({
        provider: "zhenzhen",
        taskId: "task-1",
        officialFormat: true,
      }),
      "/v2/videos/generations/task-1",
    );
  });
});
