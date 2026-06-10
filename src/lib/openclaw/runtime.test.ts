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
