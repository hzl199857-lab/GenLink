import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type { AgentTaskAttachment } from "@/types/agent";

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
  ECOM_PLANNER_PROMPT_TEMPLATE,
  buildAgentEcomPlannerOptionWorkflowPrompt,
  buildAgentEcomPlannerOptions,
  buildAgentEcomPlannerSingleOptionResult,
  buildAgentEcomPlannerPromptDisplayBlocks,
  buildAgentEcomPlannerPromptSlots,
  getAgentEcomPlannerAttachmentRole,
  getAgentEcomPlannerProductAttachments,
  getAgentEcomPlannerSubmitBlockReason,
  hasParsedEcomPlannerOption,
  hasAgentEcomPlannerProductImage,
  limitAgentEcomPlannerPromptSlots,
  parseAgentEcomPlannerModelResponse,
  shouldSendImagesForEcomPlannerOption,
} = require("./agent-ecom-planner.ts") as typeof import("./agent-ecom-planner");

function attachment(
  id: string,
  ecomPlannerRole?: AgentTaskAttachment["ecomPlannerRole"],
): AgentTaskAttachment {
  return {
    id,
    kind: "image",
    name: `${id}.png`,
    mimeType: "image/png",
    imageUrl: `https://assets.example.com/${id}.png`,
    previewUrl: `https://assets.example.com/${id}.png`,
    status: "ready",
    ecomPlannerRole,
  };
}

test("provides the ecommerce planner brief template", () => {
  assert.match(ECOM_PLANNER_PROMPT_TEMPLATE, /平台：\[如：淘宝\]/);
  assert.match(ECOM_PLANNER_PROMPT_TEMPLATE, /任务类型：\[如：主图 \+ 详情页\]/);
  assert.match(ECOM_PLANNER_PROMPT_TEMPLATE, /对标图参考点：/);
  assert.match(ECOM_PLANNER_PROMPT_TEMPLATE, /图片数量：主图5张 \+ 详情页8张/);
});

test("treats untagged ecommerce planner attachments as product images", () => {
  assert.equal(getAgentEcomPlannerAttachmentRole(attachment("product")), "product");
  assert.equal(
    getAgentEcomPlannerAttachmentRole(attachment("benchmark", "benchmark")),
    "benchmark",
  );
});

test("requires a product image before submitting ecommerce planner requests", () => {
  assert.equal(hasAgentEcomPlannerProductImage([]), false);
  assert.equal(hasAgentEcomPlannerProductImage([attachment("style", "benchmark")]), false);
  assert.equal(hasAgentEcomPlannerProductImage([attachment("product", "product")]), true);
});

test("filters ecommerce planner final generation attachments to product images", () => {
  const product = attachment("product", "product");
  const benchmark = attachment("benchmark", "benchmark");
  const untagged = attachment("untagged");

  assert.deepEqual(
    getAgentEcomPlannerProductAttachments([product, benchmark, untagged]),
    [product, untagged],
  );
});

test("sends planner images only before the shared context exists", () => {
  assert.equal(
    shouldSendImagesForEcomPlannerOption({ hasSharedPlannerContext: false }),
    true,
  );
  assert.equal(
    shouldSendImagesForEcomPlannerOption({ hasSharedPlannerContext: true }),
    false,
  );
});

test("requires a parsed raw option JSON before accepting a staged planner option", () => {
  const fallback = buildAgentEcomPlannerSingleOptionResult({
    optionId: "B",
    prompt: "浜у搧锛歔濡傦細AOC鏄剧ず鍣╙",
    attachments: [attachment("product", "product")],
  });

  assert.equal(hasParsedEcomPlannerOption(fallback, "B"), false);

  const parsed = parseAgentEcomPlannerModelResponse({
    text: JSON.stringify({
      _option_label: "方案 B - Scene Extension",
      option: {
        title: "Scene Extension",
        productName: "AOC Monitor",
      },
    }),
    fallback,
  });

  assert.equal(hasParsedEcomPlannerOption(parsed, "B"), true);
  assert.equal(hasParsedEcomPlannerOption(parsed, "A"), false);
});

test("builds prompt display blocks with title and full prompt text", () => {
  const blocks = buildAgentEcomPlannerPromptDisplayBlocks([
    {
      index: 1,
      slot: "主图｜城市雨天机能首图",
      intent: "首图点击",
      ratio: "1:1",
      prompt: "Create a premium Taobao 1:1 square main image.\n\nTEXT OVERLAY: \"城市通勤 户外防护\"",
    },
    {
      index: 10,
      slot: "详情页｜收束购买理由",
      intent: "行动收口",
      ratio: "3:4",
      prompt: "Create a 3:4 vertical closing ecommerce image.",
    },
  ]);

  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].heading, "图 01　主图｜城市雨天机能首图");
  assert.equal(blocks[0].prompt, "Create a premium Taobao 1:1 square main image.\n\nTEXT OVERLAY: \"城市通勤 户外防护\"");
  assert.equal(blocks[1].heading, "图 10　详情页｜收束购买理由");
  assert.equal(blocks[1].ratio, "3:4");
});

test("allows ten ecommerce planner prompt slots for mixed main and detail sets", () => {
  const slots = Array.from({ length: 12 }, (_, index) => ({ index: index + 1 }));

  assert.equal(limitAgentEcomPlannerPromptSlots(slots).length, 10);
});

test("builds explicit mixed main-image and detail-page prompt slots without generic fallbacks", () => {
  const slots = buildAgentEcomPlannerPromptSlots({
    optionJson: JSON.stringify({
      option: {
        "任务类型": "主图+详情页",
        "期望图片数量": "主图4张 + 详情页6张",
      },
    }),
    taskType: "主图+详情页",
  });

  assert.equal(slots.length, 10);
  assert.deepEqual(slots.slice(0, 4).map((slot) => slot.aspectRatio), ["1:1", "1:1", "1:1", "1:1"]);
  assert.deepEqual(slots.slice(4).map((slot) => slot.aspectRatio), ["3:4", "3:4", "3:4", "3:4", "3:4", "3:4"]);
  assert.deepEqual(
    slots.map((slot) => slot.title),
    [
      "主图",
      "主图",
      "主图",
      "主图",
      "详情页",
      "详情页",
      "详情页",
      "详情页",
      "详情页",
      "详情页",
    ],
  );
  assert.ok(slots.every((slot) => !/首屏 KV|延展图|核心点击|核心卖点|痛点开场/.test(slot.title)));
});

test("prompt route does not reference the removed local prompt slot constant", () => {
  const source = readFileSync(
    new URL("../app/api/openclaw/planf/ecom/planner/prompts/route.ts", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(source, /PLANNER_MAX_PROMPT_SLOTS/);
});

test("prompt route asks the model to create content-driven image titles", () => {
  const source = readFileSync(
    new URL("../app/api/openclaw/planf/ecom/planner/prompts/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /must create a concrete content title/);
  assert.match(source, /do not use generic titles/);
});

test("returns a specific block reason when only benchmark images are attached", () => {
  assert.equal(
    getAgentEcomPlannerSubmitBlockReason({
      active: true,
      attachments: [attachment("style", "benchmark")],
    }),
    "对标图只能参考风格，不能替代产品图。请先上传产品图。",
  );
});

test("does not block non-planner requests without product images", () => {
  assert.equal(
    getAgentEcomPlannerSubmitBlockReason({
      active: false,
      attachments: [],
    }),
    undefined,
  );
});

test("builds three differentiated ecommerce planner options from the user brief", () => {
  const result = buildAgentEcomPlannerOptions({
    prompt: [
      "平台：[如：淘宝]",
      "任务类型：[如：主图 + 详情页]",
      "产品：[如：AOC显示器]",
      "核心卖点：[如：4K 144Hz / 护眼低蓝光 / 27英寸 IPS]",
      "目标人群：[如：电竞玩家 / 设计师 / 办公白领]",
      "风格倾向：[如：科技感 / 极简商务 / 电竞氛围]",
      "对标图参考点：[如：参考它的桌面场景、暗色光影、文字排版，不参考产品本体]",
      "图片数量：主图5张 + 详情页8张",
    ].join("\n"),
    attachments: [
      attachment("product", "product"),
      attachment("benchmark", "benchmark"),
    ],
  });

  assert.equal(result.productName, "AOC显示器");
  assert.equal(result.productImageCount, 1);
  assert.equal(result.benchmarkImageCount, 1);
  assert.equal(result.options.length, 3);
  assert.deepEqual(result.options.map((option) => option.id), ["A", "B", "C"]);
  assert.match(result.options[0].title, /AOC显示器/);
  assert.ok(result.options.every((option) => option.imagePlan.length >= 5));
});

test("builds a workflow prompt from a selected planner option", () => {
  const result = buildAgentEcomPlannerOptions({
    prompt: "产品：[如：AOC显示器]\n核心卖点：[如：4K 144Hz / 护眼低蓝光]",
    attachments: [attachment("product", "product")],
  });

  const prompt = buildAgentEcomPlannerOptionWorkflowPrompt(result.options[0]);

  assert.match(prompt, /AOC显示器/);
  assert.match(prompt, /套图企划方案 A/);
  assert.match(prompt, /图片规划：/);
});

test("parses model planner JSON into UI planner options", () => {
  const parsed = parseAgentEcomPlannerModelResponse({
    text: JSON.stringify({
      productName: "博士入耳式耳机",
      platform: "淘宝",
      taskType: "主图+详情页",
      productImageCount: 1,
      benchmarkImageCount: 0,
      options: [
        {
          id: "A",
          title: "舒适通勤套图",
          positioning: "突出长戴舒适",
          visualDirection: "干净办公场景",
          sellingPointStrategy: "先讲佩戴，再讲电量显示",
          imagePlan: [
            { label: "主图1", aspectRatio: "1:1", intent: "搜索点击主图" },
            { label: "详情1", aspectRatio: "3:4", intent: "舒适佩戴解释" },
          ],
          benchmarkUsage: "未上传对标图",
        },
        {
          id: "B",
          title: "科技参数套图",
          positioning: "突出4灯LED电量精显",
          visualDirection: "参数化科技视觉",
          sellingPointStrategy: "参数信息前置",
          imagePlan: ["主图1 aspectRatio=1:1", "详情1 aspectRatio=3:4"],
          benchmarkUsage: "未上传对标图",
        },
        {
          id: "C",
          title: "学生党性价比套图",
          positioning: "突出日常学习场景",
          visualDirection: "年轻轻量",
          sellingPointStrategy: "用真实场景建立购买理由",
          imagePlan: ["主图1", "详情1"],
          benchmarkUsage: "未上传对标图",
        },
      ],
    }),
    fallback: buildAgentEcomPlannerOptions({
      prompt: "平台：淘宝\n任务类型：主图+详情页\n产品：博士入耳式耳机",
      attachments: [attachment("product", "product")],
    }),
  });

  assert.equal(parsed.productName, "博士入耳式耳机");
  assert.equal(parsed.options.length, 3);
  assert.equal(parsed.options[0].title, "舒适通勤套图");
  assert.match(parsed.options[0].workflowPrompt, /aspectRatio=1:1/);
  assert.match(parsed.options[0].workflowPrompt, /aspectRatio=3:4/);
});

test("parses standalone skill option JSON into UI planner details", () => {
  const parsed = parseAgentEcomPlannerModelResponse({
    text: JSON.stringify({
      _shared_planner_context: {
        anchorMode: "STYLE_FUSION_MODE",
        differentiationMatrix: {
          A: "内核复刻",
          B: "邻近延展",
          C: "跳脱创新",
        },
      },
      _system_diagnostic_log: {
        step1_routing_mode: "[TASK_TYPE: DETAIL_PAGE]",
        step5_correction_log: "All-Clear",
      },
      _option_label: "方案 A - 黑曜科技质感详情页",
      option: {
        ui_summary: {
          coreDifference: "黑曜质感主导",
          visualKeyword: "深色科技、冷光、精工感",
          sellingPointFocus: "舒适佩戴与电量可视",
          scenarioMood: "办公通勤冷感桌面",
          bestFor: "适合强调专业可信的详情页",
        },
        目标平台: "淘宝",
        任务类型: "详情页图组",
        期望图片数量: "8张",
        文案语调指引: "关键词短促，质量可视化，降低决策犹豫。",
        风格名称: "黑曜科技质感详情页",
        视觉风格与光影: {
          世界观设定: "深色冷感科技桌面",
          可用环境与道具池: "冷灰桌面、充电盒、耳机特写",
        },
        版式语言与排版哲学: {
          信息层级与留白钩子: "首屏不卖功能，先建立品质感。",
        },
        产品信息: {
          产品名称: "Baseus 半入耳式蓝牙耳机",
          适用人群: "办公通勤和学生党",
        },
        产品参数: "充电盒正面4颗LED指示灯，未明确参数不得编造。",
        全局色彩资产: {
          主背景色名: "冷雾灰",
          强调点缀色: "冰蓝光感色 #A8C5DA",
        },
        下游执行注意事项: {
          平台适配提醒: "淘宝详情页，首屏需清晰。",
        },
        用户需求原文: "无",
      },
    }),
    fallback: buildAgentEcomPlannerSingleOptionResult({
      optionId: "A",
      prompt: "平台：淘宝\n任务类型：详情页\n产品：Baseus 半入耳式蓝牙耳机",
      attachments: [attachment("product", "product")],
    }),
  });

  assert.equal(parsed.platform, "淘宝");
  assert.equal(parsed.taskType, "详情页图组");
  assert.equal(parsed.productName, "Baseus 半入耳式蓝牙耳机");
  assert.equal(parsed.options.length, 1);
  assert.equal(parsed.options[0].id, "A");
  assert.equal(parsed.options[0].title, "黑曜科技质感详情页");
  assert.equal(parsed.options[0].positioning, "黑曜质感主导");
  assert.equal(parsed.options[0].visualDirection, "深色科技、冷光、精工感");
  assert.equal(parsed.options[0].sellingPointStrategy, "舒适佩戴与电量可视");
  assert.equal(parsed.options[0].uiSummary?.bestFor, "适合强调专业可信的详情页");
  assert.equal(parsed.sharedPlannerContext?.anchorMode, "STYLE_FUSION_MODE");
  assert.ok(parsed.options[0].detailSections?.some((section) => section.title === "_system_diagnostic_log"));
  assert.match(parsed.options[0].rawOptionJson ?? "", /黑曜科技质感详情页/);
  assert.match(parsed.options[0].workflowPrompt, /完整方案模块/);
});

test("parses standalone skill JSON wrapped in natural language", () => {
  const parsed = parseAgentEcomPlannerModelResponse({
    text: [
      "方案 A 已生成：",
      JSON.stringify({
        _system_diagnostic_log: { step1_routing_mode: "[TASK_TYPE: DETAIL_PAGE]" },
        _option_label: "方案 A - 冷感办公科技风",
        option: {
          ui_summary: {
            coreDifference: "冷感办公主导",
            visualKeyword: "浅灰、冷光、办公桌面",
            sellingPointFocus: "佩戴舒适与通勤便携",
            scenarioMood: "日常办公轻科技",
            bestFor: "适合轻商务详情页",
          },
          目标平台: "淘宝",
          任务类型: "详情页图组",
          风格名称: "冷感办公科技风",
          产品信息: {
            产品名称: "Baseus 蓝牙耳机",
          },
        },
      }),
      "回复『继续』输出方案 B。",
    ].join("\n"),
    fallback: buildAgentEcomPlannerSingleOptionResult({
      optionId: "A",
      prompt: "平台：淘宝\n任务类型：详情页\n产品：Baseus 蓝牙耳机",
      attachments: [attachment("product", "product")],
    }),
  });

  assert.equal(parsed.options[0].title, "冷感办公科技风");
  assert.match(parsed.options[0].rawOptionJson ?? "", /冷感办公科技风/);
});

test("builds a single-option planner result for staged generation", () => {
  const result = buildAgentEcomPlannerSingleOptionResult({
    optionId: "B",
    prompt: "浜у搧锛歔濡傦細AOC鏄剧ず鍣╙\n浠诲姟绫诲瀷锛歔濡傦細涓诲浘 + 璇︽儏椤礭",
    attachments: [
      attachment("product", "product"),
      attachment("benchmark", "benchmark"),
    ],
  });

  assert.equal(result.options.length, 1);
  assert.equal(result.options[0].id, "B");
  assert.equal(result.productImageCount, 1);
  assert.equal(result.benchmarkImageCount, 1);
  assert.match(result.options[0].workflowPrompt, /套图企划方案 B/);
});
