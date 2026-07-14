import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const panelUrl = new URL("./MidjourneySettingsPanel.tsx", import.meta.url);
const panelSource = existsSync(panelUrl) ? readFileSync(panelUrl, "utf8") : "";
const promptBarSource = readFileSync(new URL("./ImageGenerationPromptBar.tsx", import.meta.url), "utf8");
const nodeSource = readFileSync(new URL("./ImageGenerationNode.tsx", import.meta.url), "utf8");

test("offers beginner-friendly Midjourney presets and fixed V8.1 context", () => {
  assert.match(panelSource, /Midjourney V8\.1/);
  assert.match(panelSource, /STYLIZE_PRESETS = \[50, 100, 250, 750\]/);
  assert.match(panelSource, /WEIRD_PRESETS = \[0, 100, 500\]/);
  assert.match(panelSource, /CHAOS_PRESETS = \[0, 15, 35\]/);
  assert.match(panelSource, /QUALITY_OPTIONS = \[1, 2\]/);
  assert.match(panelSource, /风格化/);
  assert.match(panelSource, /奇异度/);
  assert.match(panelSource, /混乱度/);
  assert.match(panelSource, /生成质量/);
});

test("uses accessible sliders with the supported Midjourney ranges", () => {
  assert.match(panelSource, /aria-label="风格化"[\s\S]*?min=\{0\}[\s\S]*?max=\{1000\}[\s\S]*?step=\{10\}/);
  assert.match(panelSource, /aria-label="奇异度"[\s\S]*?min=\{0\}[\s\S]*?max=\{3000\}[\s\S]*?step=\{50\}/);
  assert.match(panelSource, /aria-label="混乱度"[\s\S]*?min=\{0\}[\s\S]*?max=\{100\}[\s\S]*?step=\{1\}/);
  assert.match(panelSource, /onPointerDown=\{\(event\) => event\.stopPropagation\(\)\}/);
});

test("keeps slider dragging local until pointer release and blocks ReactFlow gestures", () => {
  assert.match(panelSource, /const \[draftSettings, setDraftSettings\] = useState\(value\)/);
  assert.match(panelSource, /const isSliderDraggingRef = useRef\(false\)/);
  assert.match(panelSource, /className="[^"]*nodrag[^"]*nopan[^"]*nowheel/);
  assert.match(panelSource, /onPointerDown=\{handleSliderPointerDown\}/);
  assert.match(panelSource, /onPointerUp=\{handleSliderPointerUp\}/);
  assert.match(panelSource, /value=\{draftSettings\.stylize\}/);
  assert.match(panelSource, /value=\{draftSettings\.weird\}/);
  assert.match(panelSource, /value=\{draftSettings\.chaos\}/);
});

test("replaces generic Midjourney controls with ratio and a dedicated settings panel", () => {
  assert.match(promptBarSource, /const isMidjourneyModel = isComflyMidjourneyModel\(provider, model\)/);
  assert.match(promptBarSource, /const settingsLabel = isMidjourneyModel\s*\? modelAspectRatio\s*:/);
  assert.match(promptBarSource, /const showFormatMenu =\s*!isMidjourneyModel/);
  assert.match(promptBarSource, /isMidjourneyModel \? null : \([\s\S]*?IMAGE_SIZE_OPTIONS\.map/);
  assert.match(promptBarSource, /isNanoBananaModel \|\| isMidjourneyModel \? null : \(/);
  assert.match(promptBarSource, /<MidjourneySettingsPanel[\s\S]*?value=\{midjourneySettings\}/);
  assert.match(promptBarSource, /aria-label="Midjourney 高级设置"/);
});

test("persists normalized Midjourney settings through image node data", () => {
  assert.match(nodeSource, /normalizeMidjourneySettings\(data\.midjourneySettings\)/);
  assert.match(nodeSource, /midjourneySettings=\{normalizedMidjourneySettings\}/);
  assert.match(nodeSource, /onMidjourneySettingsChange=\{handleMidjourneySettingsChange\}/);
  assert.match(nodeSource, /midjourneySettings: next/);
});
