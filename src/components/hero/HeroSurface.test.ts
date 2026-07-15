import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const readHeroFile = (name: string) =>
  readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("the home composer exposes the approved controls", () => {
  const source = readHeroFile("HeroAgentComposer.tsx");

  assert.match(source, /AGENT_MODEL_OPTIONS/);
  assert.match(source, /accept="image\/\*"/);
  assert.match(source, /multiple/);
  assert.match(source, /onFilesChange/);
  assert.match(source, /onRun/);
  assert.match(source, /disabled=\{!prompt\.trim\(\) \|\| busy\}/);
  assert.doesNotMatch(source, /PromptMentionInput/);
});

test("the recent project strip uses only existing project metadata", () => {
  const source = readHeroFile("HeroRecentProjects.tsx");

  assert.match(source, /selectRecentProjects/);
  assert.match(source, /新建项目/);
  assert.match(source, /所有项目/);
  assert.match(source, /project\.thumbnailUrl/);
  assert.match(source, /project\.name/);
  assert.match(source, /project\.updatedAt/);
  assert.doesNotMatch(source, /promptSummary|promptPreview/);
});

test("the hero replaces the old start button with the composer", () => {
  const source = readHeroFile("GenLinkHero.tsx");

  assert.match(source, /HeroAgentComposer/);
  assert.match(source, /HeroRecentProjects/);
  assert.doesNotMatch(source, /ShinyButton/);
});
