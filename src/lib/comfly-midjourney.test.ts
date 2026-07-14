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
  buildMidjourneyPrompt,
  extractMidjourneyUpscaleActions,
  fetchMidjourneyTask,
  getConfiguredComflyMidjourneyBaseUrl,
  parseMidjourneySubmission,
  parseMidjourneyUpscaleRequest,
  submitMidjourneyImagine,
  submitMidjourneyUpscale,
} = require("./comfly-midjourney.ts") as typeof import("./comfly-midjourney");

test("always appends fixed V8.1 and normalized UI settings", () => {
  assert.equal(
    buildMidjourneyPrompt("cat", "16:9", {
      stylize: 250,
      weird: 100,
      chaos: 15,
      quality: 2,
    }),
    "cat --v 8.1 --ar 16:9 --s 250 --weird 100 --chaos 15 --q 2",
  );
});

test("replaces every managed Midjourney flag without duplicates", () => {
  assert.equal(
    buildMidjourneyPrompt(
      "cat --version 7 --aspect=3:2 --stylize 999 --weird=44 --c 80 --quality=2",
      "4:3",
      { stylize: 50, weird: 0, chaos: 35, quality: 1 },
    ),
    "cat --v 8.1 --ar 4:3 --s 50 --weird 0 --chaos 35 --q 1",
  );
});

test("auto aspect ratio omits the managed aspect flag", () => {
  assert.equal(
    buildMidjourneyPrompt("cat --ar 16:9", "auto"),
    "cat --v 8.1 --s 100 --weird 0 --chaos 0 --q 1",
  );
});

test("accepts submitted and queued Imagine responses", () => {
  assert.deepEqual(
    parseMidjourneySubmission({ code: 1, result: "task-a", description: "ok" }),
    { taskId: "task-a" },
  );
  assert.deepEqual(
    parseMidjourneySubmission({ code: 22, result: "task-b", description: "queued" }),
    { taskId: "task-b" },
  );
});

test("maps queue full and sensitive prompt responses to stable errors", () => {
  assert.throws(
    () => parseMidjourneySubmission({ code: 23, description: "full" }),
    /队列已满/,
  );
  assert.throws(
    () => parseMidjourneySubmission({ code: 24, description: "blocked" }),
    /敏感/,
  );
});

test("extracts a complete U1-U4 action map from unordered buttons", () => {
  assert.deepEqual(
    extractMidjourneyUpscaleActions([
      { label: "U3", customId: "three" },
      { label: "V1", customId: "variation" },
      { label: "U1", customId: "one" },
      { label: "U4", customId: "four" },
      { label: "U2", customId: "two" },
    ]),
    { 1: "one", 2: "two", 3: "three", 4: "four" },
  );
});

test("does not expose quadrant selection for an incomplete action map", () => {
  assert.equal(
    extractMidjourneyUpscaleActions([{ label: "U1", customId: "one" }]),
    undefined,
  );
});

test("submits text generation with an empty base64Array", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const result = await submitMidjourneyImagine({
    prompt: "cat",
    aspectRatio: "1:1",
    apiKey: "secret",
    baseUrl: "https://example.com/v1/",
    images: [],
    readImage: async () => {
      throw new Error("readImage should not be called");
    },
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return Response.json({ code: 1, result: "task-1", description: "ok" });
    },
  });

  assert.deepEqual(result, { taskId: "task-1" });
  assert.equal(calls[0].url, "https://example.com/v1/mj/submit/imagine");
  assert.equal(new Headers(calls[0].init?.headers).get("Authorization"), "Bearer secret");
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
    prompt: "cat --v 8.1 --ar 1:1 --s 100 --weird 0 --chaos 0 --q 1",
    base64Array: [],
  });
});

test("submits selected Midjourney V8.1 settings to Imagine", async () => {
  const bodies: unknown[] = [];
  await submitMidjourneyImagine({
    prompt: "portrait",
    aspectRatio: "16:9",
    settings: { stylize: 250, weird: 100, chaos: 15, quality: 2 },
    apiKey: "secret",
    baseUrl: "https://example.com",
    images: [],
    readImage: async () => {
      throw new Error("readImage should not be called");
    },
    fetchImpl: async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return Response.json({ code: 1, result: "task-settings", description: "ok" });
    },
  });

  assert.deepEqual(bodies[0], {
    prompt: "portrait --v 8.1 --ar 16:9 --s 250 --weird 100 --chaos 15 --q 2",
    base64Array: [],
  });
});

test("submits every reference image as a data URL in source order", async () => {
  const bodies: unknown[] = [];
  await submitMidjourneyImagine({
    prompt: "cat",
    apiKey: "secret",
    baseUrl: "https://example.com",
    images: [{ url: "first" }, { url: "second" }],
    readImage: async (_image, index) => ({
      bytes: Buffer.from(index === 0 ? "one" : "two"),
      mediaType: index === 0 ? "image/png" : "image/jpeg",
    }),
    fetchImpl: async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return Response.json({ code: 22, result: "task-2", description: "queued" });
    },
  });

  assert.deepEqual(bodies[0], {
    prompt: "cat --v 8.1 --s 100 --weird 0 --chaos 0 --q 1",
    base64Array: [
      `data:image/png;base64,${Buffer.from("one").toString("base64")}`,
      `data:image/jpeg;base64,${Buffer.from("two").toString("base64")}`,
    ],
  });
});

test("queries a completed task and returns grid actions", async () => {
  const result = await fetchMidjourneyTask({
    taskId: "task-3",
    apiKey: "secret",
    baseUrl: "https://example.com",
    fetchImpl: async (url) => {
      assert.equal(String(url), "https://example.com/mj/task/task-3/fetch");
      return Response.json({
        id: "task-3",
        status: "SUCCESS",
        imageUrl: "https://example.com/grid.png",
        buttons: [
          { label: "U4", customId: "four" },
          { label: "U2", customId: "two" },
          { label: "U1", customId: "one" },
          { label: "U3", customId: "three" },
        ],
      });
    },
  });

  assert.deepEqual(result, {
    status: "completed",
    taskId: "task-3",
    imageUrl: "https://example.com/grid.png",
    actions: { 1: "one", 2: "two", 3: "three", 4: "four" },
  });
});

test("keeps active Midjourney tasks pending", async () => {
  for (const status of ["NOT_START", "SUBMITTED", "IN_PROGRESS"] as const) {
    const result = await fetchMidjourneyTask({
      taskId: "active",
      apiKey: "secret",
      baseUrl: "https://example.com",
      fetchImpl: async () => Response.json({ id: "active", status }),
    });
    assert.deepEqual(result, { status: "pending" });
  }
});

test("rejects terminal failures and unsupported modal tasks", async () => {
  for (const [status, message] of [
    ["FAILURE", "provider failed"],
    ["CANCEL", "任务已取消"],
    ["MODAL", "高级交互"],
  ] as const) {
    await assert.rejects(
      fetchMidjourneyTask({
        taskId: "failed",
        apiKey: "secret",
        baseUrl: "https://example.com",
        fetchImpl: async () => Response.json({ status, failReason: "provider failed" }),
      }),
      new RegExp(message),
    );
  }
});

test("submits the stored action for the selected quadrant", async () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  const result = await submitMidjourneyUpscale({
    taskId: "source-task",
    quadrant: 2,
    actions: { 1: "one", 2: "two", 3: "three", 4: "four" },
    apiKey: "secret",
    baseUrl: "https://example.com",
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return Response.json({ code: 1, result: "upscale-task", description: "ok" });
    },
  });

  assert.deepEqual(result, { taskId: "upscale-task" });
  assert.deepEqual(calls[0], {
    url: "https://example.com/mj/submit/action",
    body: { taskId: "source-task", customId: "two" },
  });
});

test("accepts only a job ID and quadrant 1-4 for upscale requests", () => {
  assert.deepEqual(
    parseMidjourneyUpscaleRequest({ jobId: "job-1", quadrant: 3 }),
    { jobId: "job-1", quadrant: 3 },
  );
  assert.throws(
    () => parseMidjourneyUpscaleRequest({ jobId: "job-1", quadrant: 5 }),
    /1 到 4/,
  );
  assert.throws(
    () => parseMidjourneyUpscaleRequest({
      jobId: "job-1",
      quadrant: 2,
      customId: "free-form",
    }),
    /customId/,
  );
});

test("ignores empty configured base URLs", () => {
  const previous = {
    midjourney: process.env.COMFLY_MIDJOURNEY_BASE_URL,
    image: process.env.COMFLY_IMAGE_BASE_URL,
    base: process.env.COMFLY_BASE_URL,
  };
  process.env.COMFLY_MIDJOURNEY_BASE_URL = "";
  process.env.COMFLY_IMAGE_BASE_URL = "";
  process.env.COMFLY_BASE_URL = "https://ai.comfly.org/v1";

  try {
    assert.equal(getConfiguredComflyMidjourneyBaseUrl(), "https://ai.comfly.org");
  } finally {
    for (const [key, value] of Object.entries({
      COMFLY_MIDJOURNEY_BASE_URL: previous.midjourney,
      COMFLY_IMAGE_BASE_URL: previous.image,
      COMFLY_BASE_URL: previous.base,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
