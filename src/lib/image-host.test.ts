import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");

require.extensions[".ts"] = (module: NodeModule, filename: string) => {
  const source = require("node:fs").readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      strict: true,
    },
    fileName: filename,
  });

  (module as NodeModule & { _compile(source: string, filename: string): void })._compile(
    output.outputText,
    filename,
  );
};

const originalLoad = Module._load;

Module._load = function patchedLoad(request: string, parent: NodeModule | null, isMain: boolean) {
  if (request === "server-only") return {};

  if (request === "@/lib/local-image-storage") {
    return {
      getLocalImageDirectory: () => "",
      LOCAL_IMAGE_ROUTE_PREFIX: "/api/image-hosting/file",
    };
  }

  if (request === "@/lib/vibe") {
    return {
      VibeApiError: class VibeApiError extends Error {
        status: number;

        constructor(status: number, message: string) {
          super(message);
          this.status = status;
        }
      },
    };
  }

  return originalLoad.call(this, request, parent, isMain);
};

process.env.ALIYUN_OSS_BUCKET = "genlink-img";
process.env.ALIYUN_OSS_REGION = "oss-cn-guangzhou";
process.env.ALIYUN_OSS_ACCESS_KEY_ID = "test-key-id";
process.env.ALIYUN_OSS_ACCESS_KEY_SECRET = "test-key-secret";
process.env.ALIYUN_OSS_INTERNAL_ENDPOINT =
  "https://oss-cn-guangzhou-internal.aliyuncs.com";

const { createAliyunOssUploadTarget } = require("./image-host.ts") as typeof import("./image-host");

Module._load = originalLoad;

test("adds the bucket subdomain to a region-level OSS internal endpoint", () => {
  const target = createAliyunOssUploadTarget({
    contentType: "image/png",
    fileName: "portrait.png",
    folder: "images",
    useInternalEndpoint: true,
  });

  assert.equal(
    new URL(target.uploadUrl).hostname,
    "genlink-img.oss-cn-guangzhou-internal.aliyuncs.com",
  );
});
