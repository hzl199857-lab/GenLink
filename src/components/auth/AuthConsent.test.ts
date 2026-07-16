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

test("authentication consent links to complete legal documents", () => {
  assert.match(consentSource, /type="checkbox"/);
  assert.match(consentSource, /href="\/legal\/terms"/);
  assert.match(consentSource, /href="\/legal\/community-guidelines"/);
  assert.match(consentSource, /href="\/legal\/privacy"/);
  assert.match(consentSource, /target="_blank"/);
});

test("login and registration require explicit legal consent", () => {
  assert.match(loginSource, /if \(!consentAccepted\)/);
  assert.match(loginSource, /<AuthConsent/);
  assert.match(registerSource, /if \(!consentAccepted\)/);
  assert.match(registerSource, /<AuthConsent/);
});

test("legal documents cover service, safety, and privacy obligations", () => {
  assert.match(legalDocumentSource, /GenLink 服务条款/);
  assert.match(legalDocumentSource, /GenLink 社区准则/);
  assert.match(legalDocumentSource, /GenLink 隐私政策/);
  assert.match(legalDocumentSource, /Cookie 与本地存储/);
  assert.match(legalDocumentSource, /未成年人保护/);
  assert.match(legalDocumentSource, /AI 标识/);
});
