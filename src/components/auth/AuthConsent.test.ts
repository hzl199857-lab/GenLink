import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const consentSource = readFileSync(new URL("./AuthConsent.tsx", import.meta.url), "utf8");
const loginSource = readFileSync(new URL("./LoginForm.tsx", import.meta.url), "utf8");
const registerSource = readFileSync(new URL("./RegisterFlow.tsx", import.meta.url), "utf8");
const legalDocumentSource = readFileSync(
  new URL("../../lib/legal-documents.ts", import.meta.url),
  "utf8",
);
const returnHelperSource = readFileSync(
  new URL("../../lib/auth-dialog-return.ts", import.meta.url),
  "utf8",
);
const legalPageSource = readFileSync(
  new URL("../legal/LegalDocumentPage.tsx", import.meta.url),
  "utf8",
);
const homePageSource = readFileSync(
  new URL("../../app/page.tsx", import.meta.url),
  "utf8",
);
const authDialogSource = readFileSync(
  new URL("../hero/HomeAuthDialog.tsx", import.meta.url),
  "utf8",
);

test("authentication consent links to complete legal documents", () => {
  assert.match(consentSource, /type="checkbox"/);
  assert.match(consentSource, /buildLegalDocumentHref\("\/legal\/terms", mode\)/);
  assert.match(
    consentSource,
    /buildLegalDocumentHref\("\/legal\/community-guidelines", mode\)/,
  );
  assert.match(consentSource, /buildLegalDocumentHref\("\/legal\/privacy", mode\)/);
  assert.match(consentSource, /target="_blank"/);
});

test("returning from a legal document restores the originating auth dialog", () => {
  assert.match(returnHelperSource, /value === "login" \|\| value === "register"/);
  assert.match(legalPageSource, /buildAuthReturnHref\(returnAuthMode\)/);
  assert.match(homePageSource, /searchParams\.get\(AUTH_DIALOG_QUERY_PARAM\)/);
  assert.match(homePageSource, /Boolean\(returnedAuthMode\)/);
  assert.match(homePageSource, /returnedAuthMode \?\? 'login'/);
  assert.match(homePageSource, /router\.replace\('\/'\)/);
  assert.match(homePageSource, /initialMode=\{authDialogMode\}/);
  assert.match(authDialogSource, /useState<AuthDialogMode>\(initialMode\)/);
});

test("login and registration require explicit legal consent", () => {
  assert.match(loginSource, /if \(!consentAccepted\)/);
  assert.match(loginSource, /<AuthConsent/);
  assert.match(registerSource, /if \(!consentAccepted\)/);
  assert.match(registerSource, /<AuthConsent/);
});

test("registration handles failed API responses without parsing them blindly", () => {
  assert.match(registerSource, /readAuthApiResponse/);
  assert.doesNotMatch(registerSource, /response\.json\(\)/);
  assert.doesNotMatch(registerSource, /verifyResponse\.json\(\)/);
});

test("registration surfaces validation, request progress, and API failures", () => {
  assert.match(registerSource, /setError\([\s\S]*?\\u8bf7\\u8f93\\u5165/);
  assert.match(registerSource, /aria-busy=\{sendingCode\}/);
  assert.match(registerSource, /LoaderCircle className="h-4 w-4 animate-spin"/);
  assert.match(registerSource, /role="alert" aria-live="polite"/);
});

test("legal documents cover service, safety, and privacy obligations", () => {
  assert.match(legalDocumentSource, /GenLink 服务条款/);
  assert.match(legalDocumentSource, /GenLink 社区准则/);
  assert.match(legalDocumentSource, /GenLink 隐私政策/);
  assert.match(legalDocumentSource, /Cookie 与本地存储/);
  assert.match(legalDocumentSource, /未成年人保护/);
  assert.match(legalDocumentSource, /AI 标识/);
});
