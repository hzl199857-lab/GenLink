import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const Module = require("node:module") as typeof import("node:module");
const originalLoad = Module._load;

Module._load = function patchedLoad(request: string, parent: NodeModule | null, isMain: boolean) {
  if (request === "server-only") {
    return {};
  }

  if (request === "@/lib/vibe") {
    return {
      generateText: async () => {
        throw new Error("generateText should not be called by runtime field parser tests");
      },
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

  module._compile(output.outputText, filename);
};

const {
  normalizeOpenClawFormFieldsForPreset,
  parseOpenClawFormFields,
} = require("./runtime.ts") as typeof import("./runtime");

test("parses form-fields JSON after non-protocol preface and unrelated JSON", () => {
  const fields = parseOpenClawFormFields([
    "JSON 协议输出前，我先读取缺失的本地规则文件。",
    "{\"cmd\":\"Get-Content -Raw .\\\\BOOTSTRAP.md\",\"yieldMs\":1000}",
    JSON.stringify({
      type: "form-fields",
      fields: [
        {
          id: "productName",
          label: "产品名称",
          type: "text",
          value: "蕉下运动跑鞋",
          required: true,
        },
        {
          id: "category",
          label: "商品类目",
          type: "select",
          default: "running-shoes",
          options: [{ label: "运动跑鞋 / 运动鞋", value: "running-shoes" }],
          required: true,
        },
        {
          id: "platform",
          label: "投放平台",
          type: "select",
          default: "rednote",
          options: [{ label: "小红书", value: "rednote" }],
          required: true,
        },
      ],
      route: "ecomImageTrack",
      nextAction: "await-form-submit",
      loadedFiles: ["AGENTS.md", "BOOTSTRAP.md"],
    }),
  ].join(""));

  assert.ok(fields);
  assert.equal(fields[0]?.id, "productName");
});

test("normalizes model text sellingPoints into multi-select options for UGC ecommerce starts", () => {
  const fields = parseOpenClawFormFields(JSON.stringify({
    type: "form-fields",
    fields: [
      {
        id: "productName",
        label: "产品 / 品牌",
        type: "text",
        value: "辣妹短裙套装",
        required: true,
      },
      {
        id: "platform",
        label: "投放平台",
        type: "select",
        default: "xiaohongshu",
        options: [
          { label: "小红书", value: "xiaohongshu" },
          { label: "Instagram", value: "instagram" },
        ],
        required: true,
      },
      {
        id: "category",
        label: "类目",
        type: "select",
        default: "apparel",
        options: [
          { label: "服饰内衣", value: "apparel" },
          { label: "其他/通用", value: "general" },
        ],
        required: true,
      },
      {
        id: "sellingPoints",
        label: "核心卖点",
        type: "text",
        value: "",
        required: false,
      },
    ],
  }));

  assert.ok(fields);

  const normalized = normalizeOpenClawFormFieldsForPreset(fields, "ugc-lifestyle");
  const sellingPoints = normalized.find((field) => field.id === "sellingPoints");

  assert.equal(sellingPoints?.type, "multi-select");

  if (sellingPoints?.type !== "multi-select") {
    throw new Error("expected sellingPoints multi-select");
  }

  assert.deepEqual(
    sellingPoints.options.map((option) => option.label),
    ["显瘦版型", "高腰设计", "拉长腿部比例", "辣妹风格", "日常好搭", "出片上镜", "舒适面料"],
  );
  assert.deepEqual(sellingPoints.value, ["slimming_fit", "high_waist", "leg_lengthening"]);
});

test("keeps user-explicit sellingPoints as hidden text source", () => {
  const fields = parseOpenClawFormFields(JSON.stringify({
    type: "form-fields",
    fields: [
      {
        id: "productName",
        label: "产品 / 品牌",
        type: "text",
        value: "棒球帽",
        required: true,
      },
      {
        id: "platform",
        label: "投放平台",
        type: "select",
        default: "amazon",
        options: [{ label: "亚马逊", value: "amazon" }],
        required: true,
      },
      {
        id: "category",
        label: "类目",
        type: "select",
        default: "apparel",
        options: [{ label: "服饰内衣", value: "apparel" }],
        required: true,
      },
      {
        id: "sellingPoints",
        label: "核心卖点",
        type: "text",
        value: "透气网眼、可调节帽围、防晒",
        source: "user_explicit",
        required: false,
      },
    ],
  }));

  assert.ok(fields);

  const normalized = normalizeOpenClawFormFieldsForPreset(fields, "amazon-adapter");
  const sellingPoints = normalized.find((field) => field.id === "sellingPoints");

  assert.equal(sellingPoints?.type, "text");
  assert.equal(sellingPoints?.source, "user_explicit");
});

test("keeps model-suggested sellingPoints as multi-select suggestions", () => {
  const fields = parseOpenClawFormFields(JSON.stringify({
    type: "form-fields",
    fields: [
      {
        id: "productName",
        label: "产品 / 品牌",
        type: "text",
        value: "无线耳机",
        required: true,
      },
      {
        id: "platform",
        label: "投放平台",
        type: "select",
        default: "amazon",
        options: [{ label: "亚马逊", value: "amazon" }],
        required: true,
      },
      {
        id: "category",
        label: "类目",
        type: "select",
        default: "digital3c",
        options: [{ label: "数码 3C", value: "digital3c" }],
        required: true,
      },
      {
        id: "sellingPoints",
        label: "核心卖点",
        type: "multi-select",
        value: ["noise_canceling"],
        source: "model_suggested",
        options: [
          { label: "主动降噪", value: "noise_canceling" },
          { label: "长续航", value: "long_battery" },
        ],
        required: false,
        maxSelected: 3,
      },
    ],
  }));

  assert.ok(fields);

  const normalized = normalizeOpenClawFormFieldsForPreset(fields, "amazon-adapter");
  const sellingPoints = normalized.find((field) => field.id === "sellingPoints");

  assert.equal(sellingPoints?.type, "multi-select");
  assert.equal(sellingPoints?.source, "model_suggested");
});

test("does not prepend apparel defaults to model-suggested shoe sellingPoints", () => {
  const fields = parseOpenClawFormFields(JSON.stringify({
    type: "form-fields",
    fields: [
      {
        id: "productName",
        label: "产品 / 品牌",
        type: "text",
        value: "蕉下运动跑鞋",
        required: true,
      },
      {
        id: "platform",
        label: "投放平台",
        type: "select",
        default: "xiaohongshu",
        options: [{ label: "小红书", value: "xiaohongshu" }],
        required: true,
      },
      {
        id: "category",
        label: "类目",
        type: "select",
        default: "shoebag",
        options: [{ label: "鞋靴箱包", value: "shoebag" }],
        required: true,
      },
      {
        id: "sellingPoints",
        label: "核心卖点",
        type: "multi-select",
        value: ["breathable", "cushioning"],
        source: "model_suggested",
        options: [
          { label: "透气轻量", value: "breathable" },
          { label: "舒适缓震", value: "cushioning" },
          { label: "运动百搭", value: "sporty_versatile" },
        ],
        required: false,
        maxSelected: 3,
      },
    ],
  }));

  assert.ok(fields);

  const normalized = normalizeOpenClawFormFieldsForPreset(fields, "ugc-lifestyle");
  const sellingPoints = normalized.find((field) => field.id === "sellingPoints");

  assert.equal(sellingPoints?.type, "multi-select");

  if (sellingPoints?.type !== "multi-select") {
    throw new Error("expected sellingPoints multi-select");
  }

  assert.deepEqual(
    sellingPoints.options.map((option) => option.label),
    ["透气轻量", "舒适缓震", "运动百搭"],
  );
  assert.deepEqual(sellingPoints.value, ["breathable", "cushioning"]);
});

test("turns default-guess sellingPoints into text input instead of multi-select", () => {
  const fields = parseOpenClawFormFields(JSON.stringify({
    type: "form-fields",
    fields: [
      {
        id: "productName",
        label: "产品 / 品牌",
        type: "text",
        value: "棒球帽",
        required: true,
      },
      {
        id: "platform",
        label: "投放平台",
        type: "select",
        default: "amazon",
        options: [{ label: "亚马逊", value: "amazon" }],
        required: true,
      },
      {
        id: "category",
        label: "类目",
        type: "select",
        default: "apparel",
        options: [{ label: "服饰内衣", value: "apparel" }],
        required: true,
      },
      {
        id: "sellingPoints",
        label: "核心卖点",
        type: "text",
        value: "",
        source: "default_guess",
        required: false,
      },
    ],
  }));

  assert.ok(fields);

  const normalized = normalizeOpenClawFormFieldsForPreset(fields, "amazon-adapter");
  const sellingPoints = normalized.find((field) => field.id === "sellingPoints");

  assert.equal(sellingPoints?.type, "text");
  assert.equal(sellingPoints?.source, "default_guess");
});
