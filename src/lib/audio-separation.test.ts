import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const Module = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = Module._load;

Module._load = function patchedLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === "server-only") {
    return {};
  }

  return originalLoad(request, parent, isMain);
};

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
  buildRunningHubAudioSeparationSubmitBody,
  parseRunningHubAudioSeparationResult,
} = require("./audio-separation.ts") as typeof import("./audio-separation");

describe("RunningHub audio separation request mapping", () => {
  it("maps the uploaded audio file to the separation AI App node", () => {
    const body = buildRunningHubAudioSeparationSubmitBody({
      audioFileName: "openapi/source.mp3",
      instanceType: "plus",
    });

    assert.deepEqual(body, {
      nodeInfoList: [
        {
          nodeId: "317",
          fieldName: "audio",
          fieldValue: "openapi/source.mp3",
          description: "添加音频",
        },
      ],
      instanceType: "plus",
      usePersonalQueue: "false",
    });
  });

  it("defaults audio separation to the default RunningHub instance", () => {
    const body = buildRunningHubAudioSeparationSubmitBody({
      audioFileName: "openapi/source.wav",
    });

    assert.equal(body.instanceType, "default");
  });

  it("parses two audio results as vocal and accompaniment outputs", () => {
    const result = parseRunningHubAudioSeparationResult("rh-task-1", {
      taskId: "rh-task-1",
      status: "SUCCESS",
      results: [
        {
          url: "https://example.com/song_vocal.wav",
          outputType: "wav",
        },
        {
          url: "https://example.com/song_instrumental.mp3",
          outputType: "mp3",
        },
      ],
    });

    assert.equal(result.taskId, "rh-task-1");
    assert.equal(result.vocal.audioUrl, "https://example.com/song_vocal.wav");
    assert.equal(result.vocal.mimeType, "audio/wav");
    assert.equal(result.accompaniment.audioUrl, "https://example.com/song_instrumental.mp3");
    assert.equal(result.accompaniment.mimeType, "audio/mpeg");
  });

  it("uses result order when RunningHub does not label the two audio files", () => {
    const result = parseRunningHubAudioSeparationResult("rh-task-2", {
      taskId: "rh-task-2",
      status: "SUCCESS",
      results: [
        {
          url: "https://example.com/output_1.wav",
          outputType: "wav",
        },
        {
          url: "https://example.com/output_2.wav",
          outputType: "wav",
        },
      ],
    });

    assert.equal(result.vocal.audioUrl, "https://example.com/output_1.wav");
    assert.equal(result.accompaniment.audioUrl, "https://example.com/output_2.wav");
  });
});
