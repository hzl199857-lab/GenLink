import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const transpileTypeScriptModule = (module: NodeModule, filename: string) => {
  const source = require("node:fs").readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      strict: true,
    },
    fileName: filename,
  });

  (module as NodeModule & { _compile(source: string, filename: string): void })._compile(output.outputText, filename);
};

require.extensions[".ts"] = transpileTypeScriptModule;
require.extensions[".tsx"] = transpileTypeScriptModule;

const {
  getProxiedAudioPlaybackSrc,
  shouldUseAudioWaveformProxy,
  shouldNotifyAudioDuration,
} = require("./AudioWaveformPlayer.tsx") as typeof import("./AudioWaveformPlayer");

test("does not notify parent when decoded duration already matches known duration", () => {
  assert.equal(shouldNotifyAudioDuration(18.001, 18.0014), false);
});

test("notifies parent when decoded duration differs from known duration", () => {
  assert.equal(shouldNotifyAudioDuration(18, undefined), true);
  assert.equal(shouldNotifyAudioDuration(18, 17.5), true);
});

test("uses the media proxy only for HTTP audio waveform fallbacks", () => {
  assert.equal(shouldUseAudioWaveformProxy("https://example.com/audio.mp3"), true);
  assert.equal(shouldUseAudioWaveformProxy("/api/media/audio.mp3"), false);
  assert.equal(shouldUseAudioWaveformProxy("blob:https://example.com/audio"), false);
  assert.equal(shouldUseAudioWaveformProxy("data:audio/mpeg;base64,AAAA"), false);
});

test("builds a playable proxy URL only for remote HTTP audio", () => {
  assert.equal(
    getProxiedAudioPlaybackSrc("https://example.com/audio track.mp3"),
    "/api/image-hosting/read?url=https%3A%2F%2Fexample.com%2Faudio%20track.mp3",
  );
  assert.equal(getProxiedAudioPlaybackSrc("/api/media/audio.mp3"), "/api/media/audio.mp3");
  assert.equal(
    getProxiedAudioPlaybackSrc("blob:https://example.com/audio"),
    "blob:https://example.com/audio",
  );
});
