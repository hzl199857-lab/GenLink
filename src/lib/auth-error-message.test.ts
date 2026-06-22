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
  getLoginErrorMessage,
  getRegisterAccountErrorMessage,
  getRegisterFlowErrorMessage,
} = require("./auth-error-message.ts") as typeof import("./auth-error-message");

test("uses a clear Chinese message for login failures", () => {
  assert.equal(
    getLoginErrorMessage(),
    "邮箱或密码错误，请检查后重试",
  );
});

test("maps duplicate register email errors to Chinese", () => {
  assert.equal(
    getRegisterFlowErrorMessage("Email already registered"),
    "这个邮箱已经注册过，请直接登录",
  );
});

test("maps verification errors to Chinese", () => {
  assert.equal(
    getRegisterFlowErrorMessage("Invalid verification code"),
    "验证码不正确，请重新输入",
  );
  assert.equal(
    getRegisterFlowErrorMessage("Verification code expired"),
    "验证码已过期，请重新发送",
  );
});

test("maps account creation duplicate errors to Chinese", () => {
  assert.equal(
    getRegisterAccountErrorMessage("user already exists"),
    "这个邮箱已经注册过，请直接登录",
  );
});
