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

const { createRegisterVerificationEmail } = require("./register-verification-email.ts") as typeof import("./register-verification-email");

test("creates Chinese register verification email content", () => {
  const email = createRegisterVerificationEmail("804719");

  assert.equal(email.subject, "GenLink 注册验证码");
  assert.match(email.text, /你的 GenLink 注册验证码是 804719/);
  assert.match(email.text, /10 分钟/);
  assert.match(email.html, /验证你的邮箱/);
  assert.match(email.html, /完成 GenLink 账号注册/);
  assert.match(email.html, /804719/);
  assert.match(email.html, /如果这不是你本人操作/);
});
