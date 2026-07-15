import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./deploy.yml", import.meta.url), "utf8");

test("pins the remote npm used for deployment installs", () => {
  assert.match(source, /DEPLOY_NPM_VERSION="11\.12\.1"/);
  assert.match(source, /DEPLOY_NPM="npx -y npm@\$\{DEPLOY_NPM_VERSION\}"/);
  assert.match(source, /\$DEPLOY_NPM ci/);
  assert.match(source, /\$DEPLOY_NPM --cache "\$NPM_CACHE" cache clean --force/);
});

test("uses the China npm mirror for remote deployment installs", () => {
  assert.match(source, /NPM_REGISTRY="https:\/\/registry\.npmmirror\.com"/);
  assert.match(source, /export npm_config_registry="\$NPM_REGISTRY"/);
  assert.match(source, /export NPM_CONFIG_REGISTRY="\$NPM_REGISTRY"/);
});

test("forces server image uploads before the production build", () => {
  const setting = 'upsert_env_var "NEXT_PUBLIC_IMAGE_UPLOAD_MODE" "server"';
  const settingIndex = source.indexOf(setting);
  const buildIndex = source.indexOf("npm run build");

  assert.ok(settingIndex >= 0, "missing server image upload policy");
  assert.ok(buildIndex > settingIndex, "image upload policy must be written before build");
});

test("writes the public image CDN configuration before the production build", () => {
  const cdnBaseSetting =
    'upsert_env_var "NEXT_PUBLIC_IMAGE_CDN_BASE_URL" "https://img.zerinnai.online"';
  const cdnSourceSetting =
    'upsert_env_var "NEXT_PUBLIC_IMAGE_CDN_SOURCE_HOST" "genlink-img.oss-cn-guangzhou.aliyuncs.com"';
  const buildIndex = source.indexOf("npm run build");

  assert.ok(source.indexOf(cdnBaseSetting) >= 0, "missing image CDN base URL");
  assert.ok(source.indexOf(cdnSourceSetting) >= 0, "missing image CDN source host");
  assert.ok(buildIndex > source.indexOf(cdnBaseSetting), "CDN base URL must be written before build");
  assert.ok(buildIndex > source.indexOf(cdnSourceSetting), "CDN source host must be written before build");
});

test("embeds the release version in the production browser build", () => {
  const buildSteps = source.slice(source.lastIndexOf("install_dependencies"));
  const versionExportIndex = buildSteps.indexOf("export NEXT_PUBLIC_APP_VERSION");
  const versionAssignmentIndex = buildSteps.indexOf(
    'NEXT_PUBLIC_APP_VERSION="$(git rev-parse --short=12 HEAD)"',
  );
  const buildIndex = buildSteps.indexOf("npm run build");

  assert.ok(versionExportIndex >= 0, "missing browser build version export");
  assert.ok(versionAssignmentIndex >= 0, "missing browser build version assignment");
  assert.ok(buildIndex > versionExportIndex, "version must be exported before build");
  assert.ok(buildIndex > versionAssignmentIndex, "version must be assigned before build");
});
