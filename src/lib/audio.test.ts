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
  buildSunoMusicSubmitRequest,
  buildRunningHubVoiceCloneSubmitBody,
  parseRunningHubVoiceCloneResult,
  parseSunoFetchResult,
  parseSunoSubmitTask,
  normalizeAudioGenerationModel,
} = require("./audio.ts") as typeof import("./audio");

describe("Suno audio generation request mapping", () => {
  it("maps supported Suno labels to upstream mv values", () => {
    assert.equal(normalizeAudioGenerationModel("suno-v5.5"), "chirp-fenix");
    assert.equal(normalizeAudioGenerationModel("suno-v5"), "chirp-crow");
    assert.equal(normalizeAudioGenerationModel("suno-v4.5-plus"), "chirp-bluejay");
    assert.equal(normalizeAudioGenerationModel("unknown"), "chirp-fenix");
  });

  it("builds inspiration-mode requests from the main prompt as a description", () => {
    const request = buildSunoMusicSubmitRequest({
      prompt: "A cinematic pop song about a neon city",
      model: "suno-v5",
      mode: "inspiration",
    });

    assert.equal(request.path, "/suno/submit/music");
    assert.deepEqual(request.body, {
      gpt_description_prompt: "A cinematic pop song about a neon city",
      prompt: "",
      mv: "chirp-crow",
      make_instrumental: false,
    });
  });

  it("builds instrumental inspiration-mode requests without lyrics", () => {
    const request = buildSunoMusicSubmitRequest({
      prompt: "Ancient Chinese style instrumental music, atmospheric and cinematic",
      model: "suno-v5.5",
      mode: "inspiration",
      instrumental: true,
    });

    assert.deepEqual(request.body, {
      gpt_description_prompt: "Ancient Chinese style instrumental music, atmospheric and cinematic",
      prompt: "",
      mv: "chirp-fenix",
      make_instrumental: true,
    });
  });

  it("builds custom-mode vocal requests with lyrics, style, and title", () => {
    const request = buildSunoMusicSubmitRequest({
      prompt: "Verse one\nChorus",
      model: "suno-v4.5-plus",
      mode: "custom",
      title: "City Lights",
      style: "pop, energetic",
      instrumental: false,
      negativeTags: "distorted vocal",
      vocalGender: "f",
    });

    assert.deepEqual(request.body, {
      prompt: "Verse one\nChorus",
      mv: "chirp-bluejay",
      make_instrumental: false,
      title: "City Lights",
      tags: "pop, energetic",
      negative_tags: "distorted vocal",
      metadata: {
        vocal_gender: "f",
      },
    });
  });

  it("builds custom-mode instrumental requests without lyrics", () => {
    const request = buildSunoMusicSubmitRequest({
      prompt: "Dark guqin and cinematic percussion",
      model: "suno-v5.5",
      mode: "custom",
      title: "Mountain Dream",
      style: "guqin, cinematic, ambient",
      instrumental: true,
    });

    assert.deepEqual(request.body, {
      prompt: "",
      mv: "chirp-fenix",
      make_instrumental: true,
      title: "Mountain Dream",
      tags: "guqin, cinematic, ambient",
    });
  });

  it("builds custom-mode instrumental requests from style when prompt is empty", () => {
    const request = buildSunoMusicSubmitRequest({
      prompt: "",
      model: "suno-v5.5",
      mode: "custom",
      style: "古风纯音乐, 箫, 氛围感, 15秒",
      instrumental: true,
    });

    assert.deepEqual(request.body, {
      prompt: "",
      mv: "chirp-fenix",
      make_instrumental: true,
      tags: "古风纯音乐, 箫, 氛围感, 15秒",
    });
  });

  it("parses Comfly fetch responses from data.data clips", () => {
    const result = parseSunoFetchResult(
      "task-1",
      "chirp-fenix",
      {
        code: "200",
        message: "success",
        data: {
          task_id: "task-1",
          status: "SUCCESS",
          progress: "100%",
          data: [
            {
              id: "clip-1",
              title: "Neon City",
              audio_url: "https://example.com/song.mp3",
              metadata: {
                duration: 187,
              },
            },
          ],
        },
      },
    );

    assert.equal(result.audioUrl, "https://example.com/song.mp3");
    assert.equal(result.title, "Neon City");
    assert.equal(result.durationSeconds, 187);
  });

  it("parses completed Comfly fetch responses with direct audio fields", () => {
    const result = parseSunoFetchResult(
      "task-2",
      "chirp-fenix",
      {
        code: "200",
        data: {
          task_id: "task-2",
          status: "SUCCESS",
          audio_url: "https://example.com/direct.mp3",
          title: "Direct Result",
          duration: "15",
        },
      },
    );

    assert.equal(result.audioUrl, "https://example.com/direct.mp3");
    assert.equal(result.title, "Direct Result");
    assert.equal(result.durationSeconds, 15);
  });

  it("parses Comfly submit task ids from flexible response shapes", () => {
    assert.equal(
      parseSunoSubmitTask({
        code: "200",
        message: "success",
        data: "task-from-string",
      }),
      "task-from-string",
    );

    assert.equal(
      parseSunoSubmitTask({
        code: "200",
        data: {
          task: {
            task_id: "task-from-nested-object",
          },
        },
      }),
      "task-from-nested-object",
    );

    assert.equal(
      parseSunoSubmitTask({
        code: "200",
        message: "操作 MUSIC, 任务ID a1a3807b-0481-414a-8e6a-b9b54c39dd68, 已提交",
        data: null,
      }),
      "a1a3807b-0481-414a-8e6a-b9b54c39dd68",
    );
  });
});

describe("RunningHub voice clone request mapping", () => {
  it("maps the uploaded audio file to the voice clone AI App node", () => {
    const body = buildRunningHubVoiceCloneSubmitBody({
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

  it("defaults RunningHub voice clone to the default instance", () => {
    const body = buildRunningHubVoiceCloneSubmitBody({
      audioFileName: "openapi/source.wav",
    });

    assert.equal(body.instanceType, "default");
  });

  it("parses successful RunningHub voice clone query responses", () => {
    const result = parseRunningHubVoiceCloneResult("rh-task-1", {
      taskId: "rh-task-1",
      status: "SUCCESS",
      results: [
        {
          url: "https://example.com/output.txt",
          outputType: "txt",
        },
        {
          url: "https://example.com/cloned.wav",
          outputType: "wav",
        },
      ],
    });

    assert.equal(result.taskId, "rh-task-1");
    assert.equal(result.audioUrl, "https://example.com/cloned.wav");
    assert.equal(result.model, "runninghub-voice-clone");
    assert.equal(result.mimeType, "audio/wav");
  });
});
