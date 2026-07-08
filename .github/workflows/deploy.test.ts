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
