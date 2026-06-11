import assert from "node:assert/strict";
import test from "node:test";

import {
  getAgentBackendBaseUrl,
  proxyOpenClawRequest,
} from "./backend-proxy.ts";

const originalBackendUrl = process.env.GENLINK_AGENT_BACKEND_URL;

test.afterEach(() => {
  if (originalBackendUrl === undefined) {
    delete process.env.GENLINK_AGENT_BACKEND_URL;
  } else {
    process.env.GENLINK_AGENT_BACKEND_URL = originalBackendUrl;
  }
});

test("returns undefined when no Agent backend URL is configured", async () => {
  delete process.env.GENLINK_AGENT_BACKEND_URL;

  const request = new Request("https://genlink.example/api/openclaw/planf/ecom/start", {
    method: "POST",
    body: JSON.stringify({ request: "test" }),
  });

  assert.equal(getAgentBackendBaseUrl(), undefined);
  assert.equal(await proxyOpenClawRequest(request), undefined);
});

test("proxies OpenClaw request to configured Agent backend", async () => {
  process.env.GENLINK_AGENT_BACKEND_URL = "http://127.0.0.1:3001/";
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const request = new Request("https://genlink.example/api/openclaw/planf/ecom/start", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ignore-me": "browser-only",
    },
    body: JSON.stringify({ request: "test" }),
  });

  const response = await proxyOpenClawRequest(
    request,
    "/api/openclaw/planf/ecom/start",
    async (url, init) => {
      calls.push({ url: String(url), init });

      return new Response(JSON.stringify({ ok: true }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    },
  );

  assert.equal(response?.status, 201);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:3001/api/openclaw/planf/ecom/start");
  assert.equal(calls[0].init?.method, "POST");
  assert.equal((calls[0].init?.headers as Headers).get("content-type"), "application/json");
  assert.equal((calls[0].init?.headers as Headers).has("x-ignore-me"), false);
  assert.equal(calls[0].init?.body, JSON.stringify({ request: "test" }));
});
