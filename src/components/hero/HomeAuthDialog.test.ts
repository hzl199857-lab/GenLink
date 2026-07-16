import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const loginSource = readFileSync(
  new URL("../auth/LoginForm.tsx", import.meta.url),
  "utf8",
);
const registerSource = readFileSync(
  new URL("../auth/RegisterFlow.tsx", import.meta.url),
  "utf8",
);
const dialogUrl = new URL("./HomeAuthDialog.tsx", import.meta.url);

test("authentication forms complete through callbacks without a page reload", () => {
  assert.match(loginSource, /onSuccess\?\.\(\)/);
  assert.match(loginSource, /onRegister\?\.\(\)/);
  assert.doesNotMatch(loginSource, /window\.location\.assign/);
  assert.match(registerSource, /onSuccess\?\.\(\)/);
  assert.doesNotMatch(registerSource, /router\.push/);
});

test("the home authentication dialog supports explicit and Escape dismissal", () => {
  const dialogSource = readFileSync(dialogUrl, "utf8");

  assert.match(dialogSource, /event\.key === ['"]Escape['"]/);
  assert.match(dialogSource, /aria-label="关闭登录窗口"/);
  assert.match(dialogSource, /aria-modal="true"/);
  assert.match(dialogSource, /border-\[#363636\]/);
  assert.doesNotMatch(dialogSource, /border-white\//);
  assert.doesNotMatch(dialogSource, /onClick=\{onClose\}[^\n]*bg-black/);
});
