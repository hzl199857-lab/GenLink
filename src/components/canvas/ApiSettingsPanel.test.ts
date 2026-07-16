import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const panelSource = readFileSync(
  new URL("./ApiSettingsPanel.tsx", import.meta.url),
  "utf8",
);
const canvasSource = readFileSync(
  new URL("./InfiniteCanvas.tsx", import.meta.url),
  "utf8",
);

test("API settings can explain why a key is required", () => {
  assert.match(panelSource, /notice\?: string \| null/);
  assert.match(panelSource, /notice,[\s\S]*?ApiSettingsPanelProps/);
  assert.match(panelSource, /\{notice \? \([\s\S]*?\{notice\}/);
});

test("canvas blocks a homepage Agent request until a supported key exists", () => {
  const gateEffect = canvasSource.match(
    /useEffect\(\(\) => \{\s*if \(!initialAgentRequest\)[\s\S]*?\n  \}, \[initialAgentRequest, initialAgentRequestBlocked\]\);/,
  )?.[0] ?? "";

  assert.match(canvasSource, /hasAgentApiCredential/);
  assert.match(
    canvasSource,
    /const initialAgentRequestBlocked = Boolean\([\s\S]*?initialAgentRequest[\s\S]*?!hasAgentApiCredential\(apiSettings, initialAgentRequest\.provider\)/,
  );
  assert.match(canvasSource, /initialRequestBlocked=\{initialAgentRequestBlocked\}/);
  assert.match(canvasSource, /请先填写 Comfly 或贞贞AI工坊 API Key，保存后将自动继续当前任务。/);
  assert.match(canvasSource, /setApiSettingsOpen\(true\)/);
  assert.match(gateEffect, /const timer = window\.setTimeout/);
  assert.match(
    gateEffect,
    /promptedInitialAgentRequestIdRef\.current = initialAgentRequest\.id/,
  );
  assert.ok(
    gateEffect.indexOf("const timer = window.setTimeout") <
      gateEffect.indexOf("promptedInitialAgentRequestIdRef.current = initialAgentRequest.id"),
  );
});

test("saving a supported key resumes the retained homepage request", () => {
  assert.match(
    canvasSource,
    /handleSaveApiSettings[\s\S]*?persistApiSettings\(values\)[\s\S]*?hasAgentApiCredential\(values, initialAgentRequest\.provider\)/,
  );
  assert.match(canvasSource, /notice=\{apiSettingsNotice\}/);
  assert.match(canvasSource, /setApiSettingsNotice\(null\)[\s\S]*?setApiSettingsOpen\(false\)/);
});
