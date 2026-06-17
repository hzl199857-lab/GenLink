import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");

require.extensions[".ts"] = (module: NodeModule, filename: string) => {
  const source = require("node:fs").readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      strict: true,
    },
    fileName: filename,
  });

  (module as NodeModule & { _compile: (code: string, filename: string) => void })
    ._compile(output.outputText, filename);
};

const {
  createEmailVerificationIdentifier,
  generateEmailVerificationCode,
  hashEmailVerificationCode,
  normalizeEmailForVerification,
  verifyEmailVerificationCodeHash,
} = require("./email-verification.ts") as typeof import("./email-verification");

test("normalizes emails before storing verification identifiers", () => {
  assert.equal(normalizeEmailForVerification(" Test@Example.COM "), "test@example.com");
});

test("creates scoped identifiers for registration email verification", () => {
  assert.equal(
    createEmailVerificationIdentifier("Test@Example.COM"),
    "register-email:test@example.com",
  );
});

test("generates six digit verification codes", () => {
  const code = generateEmailVerificationCode();
  assert.match(code, /^\d{6}$/);
});

test("hashes and verifies verification codes", () => {
  const hash = hashEmailVerificationCode("123456");
  assert.equal(hash, hashEmailVerificationCode("123456"));
  assert.equal(verifyEmailVerificationCodeHash("123456", hash), true);
  assert.equal(verifyEmailVerificationCodeHash("654321", hash), false);
});
