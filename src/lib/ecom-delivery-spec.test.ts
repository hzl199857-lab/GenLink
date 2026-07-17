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

const {
  getEcomFanoutImageCount,
  resolveEcomDeliverySpec,
} = require("./ecom-delivery-spec.ts") as typeof import("./ecom-delivery-spec");

describe("resolveEcomDeliverySpec", () => {
  it("uses one white-background image plus five UGC images", () => {
    const spec = resolveEcomDeliverySpec({
      preset: "ugc-lifestyle",
      imageSet: "full-set",
      styleMode: "ugc",
      platform: "xiaohongshu",
    });

    assert.equal(spec.slots.length, 6);
    assert.equal(spec.includesWhiteBackground, true);
    assert.equal(getEcomFanoutImageCount(spec), 5);
    assert.deepEqual(new Set(spec.slots.map((slot) => slot.ratio)), new Set(["3:4"]));
    assert.match(spec.slots[1]?.slot ?? "", /Mirror Selfie/);
  });

  it("keeps Taobao UGC delivery square in automatic mode", () => {
    const spec = resolveEcomDeliverySpec({
      preset: "ugc-lifestyle",
      styleMode: "ugc",
      platform: "taobao",
    });

    assert.equal(spec.slots.length, 6);
    assert.deepEqual(new Set(spec.slots.map((slot) => slot.ratio)), new Set(["1:1"]));
  });

  it("uses one white-background image plus five stylist images", () => {
    const spec = resolveEcomDeliverySpec({ preset: "editorial-stylist" });

    assert.equal(spec.slots.length, 6);
    assert.equal(getEcomFanoutImageCount(spec), 5);
  });

  it("uses seven Amazon listing images", () => {
    const spec = resolveEcomDeliverySpec({ preset: "amazon-adapter", platform: "amazon" });

    assert.equal(spec.slots.length, 7);
    assert.equal(getEcomFanoutImageCount(spec), 6);
  });

  it("uses five detail modules without consuming one as the white-background anchor", () => {
    const spec = resolveEcomDeliverySpec({ preset: "detail-page-pack", platform: "taobao" });

    assert.equal(spec.slots.length, 5);
    assert.equal(spec.includesWhiteBackground, false);
    assert.equal(getEcomFanoutImageCount(spec), 5);
    assert.deepEqual(spec.slots.map((slot) => slot.ratio), ["3:4", "3:4", "3:4", "1:1", "4:5"]);
  });

  it("keeps the standard ecommerce set at eight square images", () => {
    const spec = resolveEcomDeliverySpec({ preset: "full-set-8", platform: "taobao" });

    assert.equal(spec.slots.length, 8);
    assert.equal(getEcomFanoutImageCount(spec), 7);
    assert.deepEqual(new Set(spec.slots.map((slot) => slot.ratio)), new Set(["1:1"]));
  });
});
