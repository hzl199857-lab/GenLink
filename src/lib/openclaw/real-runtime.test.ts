import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const Module = require("node:module") as typeof import("node:module");
const originalLoad = Module._load;
const childProcess = originalLoad.call(Module, "node:child_process", null, false) as typeof import("node:child_process");
let spawnImplementation: typeof childProcess.spawn = childProcess.spawn;

Module._load = function patchedLoad(request: string, parent: NodeModule | null, isMain: boolean) {
  if (request === "server-only") {
    return {};
  }

  if (request === "node:child_process") {
    return {
      ...childProcess,
      spawn: (...args: Parameters<typeof childProcess.spawn>) => spawnImplementation(...args),
    };
  }

  return originalLoad.call(this, request, parent, isMain);
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
  classifyOpenClawFailure,
  RealOpenClawRuntimeError,
  resolveTextBaseUrl,
  runRealOpenClaw,
} = require("./real-runtime.ts") as typeof import("./real-runtime");

const originalEnv = { ...process.env };

test.afterEach(() => {
  process.env = { ...originalEnv };
  spawnImplementation = childProcess.spawn;
});

test("explicit OpenClaw base URL does not override an Agent-selected provider", () => {
  process.env.GENLINK_OPENCLAW_TEXT_BASE_URL = "https://ai.comfly.org/v1";
  delete process.env.FUCHEERS_BASE_URL;

  assert.equal(resolveTextBaseUrl("fucheers"), "https://www.fucheers.top/v1");
});

test("explicit OpenClaw base URL remains the default when no provider is selected", () => {
  process.env.GENLINK_OPENCLAW_TEXT_BASE_URL = "https://ai.comfly.org/v1";

  assert.equal(resolveTextBaseUrl(), "https://ai.comfly.org/v1");
});

test("uses the generated OpenClaw config without persisting the request API key", async () => {
  const runtimeRoot = mkdtempSync(path.join(tmpdir(), "genlink-real-runtime-"));
  const entryPath = path.join(runtimeRoot, "openclaw.mjs");
  const baseConfigPath = path.join(runtimeRoot, "openclaw-genlink.json");
  const stateDir = path.join(runtimeRoot, "state");
  let childEnv: NodeJS.ProcessEnv | undefined;

  writeFileSync(entryPath, "");
  writeFileSync(baseConfigPath, `{
    agents: { defaults: { model: { primary: "genlink_text/gpt-5.5" } } },
    models: { providers: { genlink_text: { api: "openai-completions", models: [] } } },
  }`);
  process.env.OPENCLAW_CLI_ENTRY = entryPath;
  process.env.OPENCLAW_CONFIG_PATH = baseConfigPath;
  process.env.OPENCLAW_STATE_DIR = stateDir;
  process.env.OPENCLAW_WORKSPACE_DIR = path.join(runtimeRoot, "workspace");
  process.env.PLANF_RULES_ROOT = path.join(runtimeRoot, "rules");

  spawnImplementation = ((_command, _args, options) => {
    childEnv = options?.env;
    const child = new EventEmitter() as ReturnType<typeof childProcess.spawn>;
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    Object.assign(child, { stdout, stderr, kill: () => true });
    process.nextTick(() => {
      stdout.write(JSON.stringify({ payloads: [{ text: "ok" }] }));
      stdout.end();
      child.emit("close", 0);
    });
    return child;
  }) as typeof childProcess.spawn;

  const result = await runRealOpenClaw({
    message: "test",
    sessionKey: "test-session",
    timeoutMs: 1_000,
    provider: "comfly",
    model: "genlink_text/gemini-3.5-flash",
    apiKey: "request-secret-key",
  });

  assert.equal(result.text, "ok");
  assert.notEqual(childEnv?.OPENCLAW_CONFIG_PATH, baseConfigPath);
  assert.match(childEnv?.OPENCLAW_CONFIG_PATH ?? "", /openclaw-agent\.generated\.json$/);
  assert.doesNotMatch(
    readFileSync(childEnv?.OPENCLAW_CONFIG_PATH ?? "", "utf8"),
    /request-secret-key/,
  );
});

test("streams long OpenClaw messages instead of placing them in Windows spawn arguments", async () => {
  const runtimeRoot = mkdtempSync(path.join(tmpdir(), "genlink-long-message-"));
  const entryPath = path.join(runtimeRoot, "openclaw.mjs");
  const baseConfigPath = path.join(runtimeRoot, "openclaw-genlink.json");
  const longMessage = "rule-context\n".repeat(8_000);
  let spawnArgs: readonly string[] = [];
  let stdinMessage = "";

  writeFileSync(entryPath, "");
  writeFileSync(baseConfigPath, `{
    agents: { defaults: { model: { primary: "genlink_text/gpt-5.5" } } },
    models: { providers: { genlink_text: { api: "openai-completions", models: [] } } },
  }`);
  process.env.OPENCLAW_CLI_ENTRY = entryPath;
  process.env.OPENCLAW_CONFIG_PATH = baseConfigPath;
  process.env.OPENCLAW_STATE_DIR = path.join(runtimeRoot, "state");
  process.env.OPENCLAW_WORKSPACE_DIR = path.join(runtimeRoot, "workspace");
  process.env.PLANF_RULES_ROOT = path.join(runtimeRoot, "rules");

  spawnImplementation = ((_command, args) => {
    spawnArgs = Array.isArray(args) ? args : [];
    const child = new EventEmitter() as ReturnType<typeof childProcess.spawn>;
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    stdin.on("data", (chunk) => {
      stdinMessage += chunk.toString();
    });
    Object.assign(child, { stdin, stdout, stderr, kill: () => true });
    process.nextTick(() => {
      stdout.write(JSON.stringify({ payloads: [{ text: "ok" }] }));
      stdout.end();
      child.emit("close", 0);
    });
    return child;
  }) as typeof childProcess.spawn;

  await runRealOpenClaw({
    message: longMessage,
    sessionKey: "test-long-message",
    timeoutMs: 1_000,
    provider: "comfly",
    model: "genlink_text/gemini-3.5-flash",
    apiKey: "request-secret-key",
  });

  assert.equal(spawnArgs.includes(longMessage), false);
  assert.match(spawnArgs[0] ?? "", /openclaw-stdin-runner\.mjs$/);
  assert.equal(stdinMessage, longMessage);
});

test("stdin runner restores the OpenClaw argv inside the child process", () => {
  const runtimeRoot = mkdtempSync(path.join(tmpdir(), "genlink-stdin-runner-"));
  const entryPath = path.join(runtimeRoot, "fake-openclaw.mjs");
  const runnerPath = path.join(process.cwd(), "scripts", "openclaw-stdin-runner.mjs");
  const longMessage = "model-context\n".repeat(4_000);

  writeFileSync(
    entryPath,
    'console.log(JSON.stringify(process.argv.slice(2)));',
  );
  const result = childProcess.spawnSync(
    process.execPath,
    [runnerPath, entryPath, "agent", "--json"],
    {
      input: longMessage,
      encoding: "utf8",
      windowsHide: true,
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout.trim()), [
    "agent",
    "--json",
    "--message",
    longMessage,
  ]);
});

test("classifies model catalog and invalid config failures accurately", () => {
  assert.equal(
    classifyOpenClawFailure("Unknown model genlink_text/gemini-3.5-flash"),
    "unsupported_model",
  );
  assert.equal(
    classifyOpenClawFailure("Invalid config: models.providers is malformed"),
    "invalid_config",
  );
  assert.equal(
    classifyOpenClawFailure(
      "400 contents[0].parts[1].function_response.name: Name cannot be empty",
    ),
    "provider_tool_protocol",
  );
});

test("reports Provider content filtering instead of a generic rules failure", async () => {
  const runtimeRoot = mkdtempSync(path.join(tmpdir(), "genlink-content-filter-"));
  const entryPath = path.join(runtimeRoot, "openclaw.mjs");
  const baseConfigPath = path.join(runtimeRoot, "openclaw-genlink.json");

  writeFileSync(entryPath, "");
  writeFileSync(baseConfigPath, `{
    agents: { defaults: { model: { primary: "genlink_text/gpt-5.5" } } },
    models: { providers: { genlink_text: { api: "openai-completions", models: [] } } },
  }`);
  process.env.OPENCLAW_CLI_ENTRY = entryPath;
  process.env.OPENCLAW_CONFIG_PATH = baseConfigPath;
  process.env.OPENCLAW_STATE_DIR = path.join(runtimeRoot, "state");
  process.env.OPENCLAW_WORKSPACE_DIR = path.join(runtimeRoot, "workspace");
  process.env.PLANF_RULES_ROOT = path.join(runtimeRoot, "rules");

  spawnImplementation = (() => {
    const child = new EventEmitter() as ReturnType<typeof childProcess.spawn>;
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    Object.assign(child, { stdout, stderr, kill: () => true });
    process.nextTick(() => {
      stderr.write("Provider finish_reason: content_filter");
      stderr.end();
      child.emit("close", 1);
    });
    return child;
  }) as typeof childProcess.spawn;

  await assert.rejects(
    runRealOpenClaw({
      message: "test",
      sessionKey: "test-content-filter",
      timeoutMs: 1_000,
      provider: "comfly",
      model: "genlink_text/gemini-3.5-flash",
      apiKey: "request-secret-key",
    }),
    (error: unknown) => {
      assert.ok(error instanceof RealOpenClawRuntimeError);
      assert.equal(error.diagnostic?.kind, "provider_content_filter");
      assert.match(error.publicMessage ?? "", /内容安全过滤/);
      assert.match(error.publicMessage ?? "", /不是超时/);
      return true;
    },
  );
});

test("reports incompatible Gemini tool responses instead of a generic rules failure", async () => {
  const runtimeRoot = mkdtempSync(path.join(tmpdir(), "genlink-tool-protocol-"));
  const entryPath = path.join(runtimeRoot, "openclaw.mjs");
  const baseConfigPath = path.join(runtimeRoot, "openclaw-genlink.json");

  writeFileSync(entryPath, "");
  writeFileSync(baseConfigPath, `{
    agents: { defaults: { model: { primary: "genlink_text/gpt-5.5" } } },
    models: { providers: { genlink_text: { api: "openai-completions", models: [] } } },
  }`);
  process.env.OPENCLAW_CLI_ENTRY = entryPath;
  process.env.OPENCLAW_CONFIG_PATH = baseConfigPath;
  process.env.OPENCLAW_STATE_DIR = path.join(runtimeRoot, "state");
  process.env.OPENCLAW_WORKSPACE_DIR = path.join(runtimeRoot, "workspace");
  process.env.PLANF_RULES_ROOT = path.join(runtimeRoot, "rules");

  spawnImplementation = (() => {
    const child = new EventEmitter() as ReturnType<typeof childProcess.spawn>;
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    Object.assign(child, { stdout, stderr, kill: () => true });
    process.nextTick(() => {
      stderr.write(
        "400 contents[0].parts[1].function_response.name: Name cannot be empty",
      );
      stderr.end();
      child.emit("close", 1);
    });
    return child;
  }) as typeof childProcess.spawn;

  await assert.rejects(
    runRealOpenClaw({
      message: "test",
      sessionKey: "test-tool-protocol",
      timeoutMs: 1_000,
      provider: "comfly",
      model: "genlink_text/gemini-3.5-flash",
      apiKey: "request-secret-key",
    }),
    (error: unknown) => {
      assert.ok(error instanceof RealOpenClawRuntimeError);
      assert.equal(error.diagnostic?.kind, "provider_tool_protocol");
      assert.match(error.publicMessage ?? "", /工具协议/);
      assert.match(error.publicMessage ?? "", /不是超时/);
      return true;
    },
  );
});
