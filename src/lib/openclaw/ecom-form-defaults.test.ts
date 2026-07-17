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

  module._compile(output.outputText, filename);
};

const { mergeEcomRuntimeFormFields } = require("./ecom-form-defaults.ts") as typeof import("./ecom-form-defaults");
const { startPlanfEcomSession } = require("./planf-ecom-session.ts") as typeof import("./planf-ecom-session");

describe("mergeEcomRuntimeFormFields", () => {
  it("keeps the UGC preset's Rednote default when the request does not name a platform", () => {
    const session = startPlanfEcomSession({
      request: "帮我做一组 UGC 生活化上身图，产品是：机能风墨镜",
      preset: "ugc-lifestyle",
      referenceImageCount: 1,
    });
    const runtimeFields = session.fields.map((field) => {
      if (field.id === "platform" && field.type === "select") {
        return { ...field, value: "taobao" };
      }

      if (field.id === "imageSet" && field.type === "select") {
        return {
          ...field,
          options: field.options.map((option) => (
            option.value === "full-set" ? { ...option, label: "完整 8 图套图" } : option
          )),
        };
      }

      return field;
    });
    const merged = mergeEcomRuntimeFormFields({
      request: session.request,
      defaultFields: session.fields,
      runtimeFields,
    });

    assert.equal(merged.find((field) => field.id === "platform")?.value, "xiaohongshu");
    assert.equal(merged.find((field) => field.id === "styleMode")?.value, "ugc");
    const imageSet = merged.find((field) => field.id === "imageSet");
    assert.match(
      imageSet?.type === "select"
        ? imageSet.options.find((option) => option.value === "full-set")?.label ?? ""
        : "",
      /完整 6 图套图/,
    );
  });

  it("honors a platform explicitly named by the user", () => {
    const session = startPlanfEcomSession({
      request: "给淘宝做一组 UGC 生活化上身图，产品是：机能风墨镜",
      preset: "ugc-lifestyle",
    });
    const merged = mergeEcomRuntimeFormFields({
      request: session.request,
      defaultFields: session.fields,
      runtimeFields: session.fields,
    });

    assert.equal(merged.find((field) => field.id === "platform")?.value, "taobao");
  });

  it("restores preset-specific fields omitted by the model", () => {
    const session = startPlanfEcomSession({
      request: "帮我做一组 UGC 生活化上身图，产品是：机能风墨镜",
      preset: "ugc-lifestyle",
    });
    const merged = mergeEcomRuntimeFormFields({
      request: session.request,
      defaultFields: session.fields,
      runtimeFields: session.fields.filter((field) => field.id !== "ugcConstructPriority"),
    });

    assert.equal(merged.find((field) => field.id === "ugcConstructPriority")?.type, "multi-select");
  });
});
