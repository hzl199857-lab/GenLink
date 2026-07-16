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

test("the project strip aligns with the composer and keeps all projects inline", () => {
  const heroSource = readHeroFile("GenLinkHero.tsx");
  const projectsSource = readHeroFile("HeroRecentProjects.tsx");

  assert.match(
    heroSource,
    /max-w-\[820px\][\s\S]*HeroAgentComposer[\s\S]*HeroRecentProjects/,
  );
  assert.match(
    projectsSource,
    /recentProjects\.map[\s\S]*onClick=\{onAllProjects\}/,
  );
  assert.match(projectsSource, /self-end/);
  assert.doesNotMatch(projectsSource, /lg:grid-cols-4/);
});

test("the hero replaces the old start button with the composer", () => {
  const source = readHeroFile("GenLinkHero.tsx");

  assert.match(source, /HeroAgentComposer/);
  assert.match(source, /HeroRecentProjects/);
  assert.match(source, /onOpenAuth/);
  assert.match(source, /ShinyButton/);
  assert.match(source, /注册\/登录/);
});

test("the home authentication action uses the motion shiny button", () => {
  const heroSource = readHeroFile("GenLinkHero.tsx");
  const shinyButtonSource = readFileSync(
    new URL("../ui/shiny-button.tsx", import.meta.url),
    "utf8",
  );

  assert.match(heroSource, /<ShinyButton/);
  assert.match(heroSource, /fixed right-4 top-4 z-20[\s\S]*<ShinyButton/);
  assert.match(shinyButtonSource, /motion\.button/);
  assert.match(shinyButtonSource, /"--x": "100%"/);
  assert.match(shinyButtonSource, /maskComposite: "exclude"/);
  assert.match(shinyButtonSource, /\[--primary:0_0%_100%\]/);
});

test("the hero preserves the original title scale and spacing", () => {
  const source = readHeroFile("GenLinkHero.tsx");

  assert.match(source, /w-\[280px\].*sm:w-\[440px\].*lg:w-\[600px\]/);
  assert.match(
    source,
    /mt-6.*text-\[1rem\].*leading-relaxed.*sm:mt-8.*sm:text-\[1\.05rem\]/,
  );
});

test("the home surfaces do not use decorative white borders", () => {
  const composerSource = readHeroFile("HeroAgentComposer.tsx");
  const recentProjectsSource = readHeroFile("HeroRecentProjects.tsx");

  assert.doesNotMatch(composerSource, /border-white\//);
  assert.doesNotMatch(recentProjectsSource, /border-white\//);
  assert.match(composerSource, /focus-visible:outline/);
  assert.match(recentProjectsSource, /focus-visible:outline/);
});

test("the composer follows the compact reference proportions", () => {
  const heroSource = readHeroFile("GenLinkHero.tsx");
  const composerSource = readHeroFile("HeroAgentComposer.tsx");

  assert.match(heroSource, /max-w-\[820px\]/);
  assert.match(composerSource, /rounded-\[16px\]/);
  assert.match(composerSource, /border-\[#363636\]/);
  assert.match(composerSource, /bg-\[#212121\]/);
  assert.match(composerSource, /rows=\{2\}/);
  assert.match(composerSource, /min-h-\[64px\]/);
  assert.match(composerSource, /h-8 w-8/);
});

test("the composer reuses the Agent and model settings controls", () => {
  const source = readHeroFile("HeroAgentComposer.tsx");
  const selectSource = readFileSync(
    new URL("../agent/AgentPanelSelect.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /AgentPanelSelect/);
  assert.match(source, /aria-label="Agent 模型设置"/);
  assert.match(source, /aria-label="模型设置"/);
  assert.match(source, />\s*Agent\s*</);
  assert.match(source, />\s*模型\s*</);
  assert.doesNotMatch(source, /<select/);
  assert.doesNotMatch(selectSource, /focus:ring|outline-white/);
  assert.match(selectSource, /border-\[#363636\].*bg-\[#212121\]/);
  assert.doesNotMatch(selectSource, /bg-\[#101217\]|border-\[#2f3239\]/);
});

test("the home settings menus stay compact and match the composer surface", () => {
  const source = readHeroFile("HeroAgentComposer.tsx");

  assert.match(source, /sm:w-\[500px\]/);
  assert.match(source, /sm:w-\[560px\]/);
  assert.match(source, /flex-col overflow-visible/);
  assert.match(source, /min-h-0 overflow-y-auto/);
  assert.match(source, /grid shrink-0 grid-cols-2/);
  assert.doesNotMatch(source, /bg-\[#11141b\]/);
});
