import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
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

  (module as NodeModule & { _compile(source: string, filename: string): void })._compile(output.outputText, filename);
};

const {
  formatAgentCanvasNodeChipTitle,
  formatEcomPlannerOptionErrorText,
  formatAgentChatErrorText,
  sanitizeAgentChatText,
  shouldShowAgentInternalText,
} = require("./agent-chat-display.ts") as typeof import("./agent-chat-display");

test("hides internal agent protocol text from user-facing chat", () => {
  const internalTexts = [
    "creative-doc / ecom-image-plan",
    "OpenClaw generated workflow-json",
    "Prompt Pack ready",
    "form-fields",
    "【State】phase=triage | nextAction=ecom-image | route=ecomImageTrack",
    "loadedFiles=AGENTS.md, BOOTSTRAP.md",
  ];

  for (const text of internalTexts) {
    assert.equal(shouldShowAgentInternalText(text), false);
  }
});

test("keeps actionable ecommerce planner JSON errors visible", () => {
  const text = "Planner model did not return valid option A JSON.";

  assert.equal(
    formatEcomPlannerOptionErrorText(text, "Option A failed."),
    text,
  );
});

test("sanitizes ecom summaries to GenLink user-facing text", () => {
  const text = "保温杯的电商图编排方案已由 OpenClaw 生成，等待确认后进入 Prompt Pack / workflow-json。";

  assert.equal(sanitizeAgentChatText(text), "保温杯的电商图编排方案已生成，确认后将创建到画布。");
});

test("replaces raw internal errors with a concise user-facing fallback", () => {
  const text = "GenLink rules runtime did not return a valid workflow-json. first=bad; repair=bad.";

  assert.equal(formatAgentChatErrorText(text, "创建画布节点失败，请稍后重试。"), "创建画布节点失败，请稍后重试。");
});

test("replaces Gemini response schema errors with a concise fallback", () => {
  const text = "Invalid JSON payload received. Unknown name \"type\" at 'generation_config.response_schema.properties[0].value': Proto field is not repeating";

  assert.equal(
    formatAgentChatErrorText(text, "Agent 请求失败，请稍后重试。"),
    "Agent 请求失败，请稍后重试。",
  );
});

test("uses the user task instead of internal workflow names for canvas node chips", () => {
  assert.equal(
    formatAgentCanvasNodeChipTitle({
      title: "OpenClaw 规则库工作流",
      userPrompt: "一只小狗在草地玩耍",
      fallback: "图像生成",
    }),
    "一只小狗在草地玩耍",
  );
});

test("keeps explicit action titles for canvas node chips", () => {
  assert.equal(
    formatAgentCanvasNodeChipTitle({
      title: "草地小狗图",
      userPrompt: "一只小狗在草地玩耍",
      fallback: "图像生成",
    }),
    "草地小狗图",
  );
});

test("handled Agent request failures do not trigger the Next.js console error overlay", () => {
  const panelSource = readFileSync(
    new URL("../components/canvas/CanvasAgentPanel.tsx", import.meta.url),
    "utf8",
  );
  const requestFailureHandler = panelSource.match(
    /result = await requestAgentRun\([\s\S]*?\} catch \(error\) \{[\s\S]*?variant: 'retryable_error',[\s\S]*?\n      return;\n    \}/,
  )?.[0] ?? "";

  assert.match(requestFailureHandler, /formatAgentChatErrorText/);
  assert.match(requestFailureHandler, /variant: 'retryable_error'/);
  assert.doesNotMatch(requestFailureHandler, /console\.error/);
  assert.doesNotMatch(panelSource, /console\.error/);
});
