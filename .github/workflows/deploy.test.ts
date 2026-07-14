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
