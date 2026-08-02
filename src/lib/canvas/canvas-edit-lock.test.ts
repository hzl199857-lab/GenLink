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
  (module as NodeModule & { _compile(source: string, filename: string): void })._compile(output.outputText, filename);
};

const {
  acquireCanvasEditLock,
  buildCanvasDeepLink,
  buildCanvasEditLockKey,
  clearCanvasEditOwnerForWindow,
  isCanvasEditLeaseStale,
  parseCanvasLockMessage,
} = require("./canvas-edit-lock.ts") as typeof import("./canvas-edit-lock");

test("builds stable project and canvas lock keys", () => {
  assert.equal(
    buildCanvasEditLockKey("project / 1", "canvas / 2"),
    "genlink:canvas-edit:project%20%2F%201:canvas%20%2F%202",
  );
});

test("builds a deep link for the selected project canvas", () => {
  assert.equal(
    buildCanvasDeepLink("project-1", "canvas-2", "https://genlink.test/"),
    "https://genlink.test/?app=canvas&projectId=project-1&canvasId=canvas-2",
  );
});

test("marks an expired lease as stale", () => {
  assert.equal(isCanvasEditLeaseStale({ heartbeatAt: 1_000 }, 20_000, 15_000), true);
  assert.equal(isCanvasEditLeaseStale({ heartbeatAt: 10_000 }, 20_000, 15_000), false);
});

test("accepts only scoped canvas lock messages", () => {
  assert.deepEqual(parseCanvasLockMessage({
    type: "released",
    projectId: "project-1",
    canvasId: "canvas-1",
    ownerId: "window-1",
  }), {
    type: "released",
    projectId: "project-1",
    canvasId: "canvas-1",
    ownerId: "window-1",
  });
  assert.equal(parseCanvasLockMessage({ type: "released", projectId: "project-1" }), null);
});

test("clears only the cloned canvas owner before fallback lock acquisition", async () => {
  const sessionValues = new Map([
    ["genlink.canvasEditOwnerId", "cloned-owner"],
    ["genlink.preference", "preserve-me"],
  ]);
  const localValues = new Map<string, string>();
  const target = {
    sessionStorage: {
      getItem: (key: string) => sessionValues.get(key) ?? null,
      setItem: (key: string, value: string) => sessionValues.set(key, value),
      removeItem: (key: string) => sessionValues.delete(key),
      clear: () => sessionValues.clear(),
    },
    localStorage: {
      getItem: (key: string) => localValues.get(key) ?? null,
      setItem: (key: string, value: string) => localValues.set(key, value),
      removeItem: (key: string) => localValues.delete(key),
    },
    setInterval,
    clearInterval,
  };
  const previousWindow = globalThis.window;

  try {
    clearCanvasEditOwnerForWindow(target as unknown as Window);
    assert.equal(sessionValues.get("genlink.canvasEditOwnerId"), undefined);
    assert.equal(sessionValues.get("genlink.preference"), "preserve-me");

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: target,
    });
    const result = await acquireCanvasEditLock("project-1", "canvas-1");
    assert.equal(result.acquired, true);
    assert.notEqual(result.ownerId, "cloned-owner");
    assert.equal(sessionValues.get("genlink.preference"), "preserve-me");
    if (result.acquired) {
      result.release();
    }
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: previousWindow,
    });
  }
});

test("uses an available Web Lock instead of blocking on a stale foreign lease", async () => {
  const sessionValues = new Map<string, string>();
  const localValues = new Map<string, string>([[
    buildCanvasEditLockKey("project-1", "canvas-1"),
    JSON.stringify({
      projectId: "project-1",
      canvasId: "canvas-1",
      ownerId: "closed-window",
      heartbeatAt: Date.now(),
    }),
  ]]);
  const target = {
    sessionStorage: {
      getItem: (key: string) => sessionValues.get(key) ?? null,
      setItem: (key: string, value: string) => sessionValues.set(key, value),
      removeItem: (key: string) => sessionValues.delete(key),
    },
    localStorage: {
      getItem: (key: string) => localValues.get(key) ?? null,
      setItem: (key: string, value: string) => localValues.set(key, value),
      removeItem: (key: string) => localValues.delete(key),
    },
    setInterval,
    clearInterval,
  };
  const previousWindow = globalThis.window;
  const previousNavigator = globalThis.navigator;

  try {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: target,
    });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        locks: {
          request: async (
            _key: string,
            _options: LockOptions,
            callback: (lock: Lock | null) => Promise<void>,
          ) => callback({} as Lock),
        },
      },
    });

    const result = await acquireCanvasEditLock("project-1", "canvas-1");
    assert.equal(result.acquired, true);
    assert.notEqual(result.ownerId, "closed-window");
    if (result.acquired) {
      result.release();
    }
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: previousWindow,
    });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: previousNavigator,
    });
  }
});

test("keeps a fresh foreign lease as the fallback when Web Locks are unavailable", async () => {
  const sessionValues = new Map<string, string>();
  const localValues = new Map<string, string>([[
    buildCanvasEditLockKey("project-1", "canvas-1"),
    JSON.stringify({
      projectId: "project-1",
      canvasId: "canvas-1",
      ownerId: "active-window",
      heartbeatAt: Date.now(),
    }),
  ]]);
  const previousWindow = globalThis.window;
  const previousNavigator = globalThis.navigator;

  try {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        sessionStorage: {
          getItem: (key: string) => sessionValues.get(key) ?? null,
          setItem: (key: string, value: string) => sessionValues.set(key, value),
        },
        localStorage: {
          getItem: (key: string) => localValues.get(key) ?? null,
          setItem: (key: string, value: string) => localValues.set(key, value),
          removeItem: (key: string) => localValues.delete(key),
        },
        setInterval,
        clearInterval,
      },
    });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {},
    });

    const result = await acquireCanvasEditLock("project-1", "canvas-1");
    assert.deepEqual(result, { acquired: false, ownerId: "active-window" });
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: previousWindow,
    });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: previousNavigator,
    });
  }
});

test("handoff does not announce a normal release that could reacquire in the source window", async () => {
  const sessionValues = new Map<string, string>();
  const localValues = new Map<string, string>();
  const messages: Array<{ type?: string }> = [];
  const previousWindow = globalThis.window;
  const previousNavigator = globalThis.navigator;
  const previousBroadcastChannel = globalThis.BroadcastChannel;

  class FakeBroadcastChannel {
    constructor() {}
    postMessage(message: { type?: string }) {
      messages.push(message);
    }
    close() {}
  }

  try {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        sessionStorage: {
          getItem: (key: string) => sessionValues.get(key) ?? null,
          setItem: (key: string, value: string) => sessionValues.set(key, value),
        },
        localStorage: {
          getItem: (key: string) => localValues.get(key) ?? null,
          setItem: (key: string, value: string) => localValues.set(key, value),
          removeItem: (key: string) => localValues.delete(key),
        },
        setInterval,
        clearInterval,
      },
    });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {},
    });
    Object.defineProperty(globalThis, "BroadcastChannel", {
      configurable: true,
      value: FakeBroadcastChannel,
    });

    const result = await acquireCanvasEditLock("project-1", "canvas-1");
    assert.equal(result.acquired, true);
    if (result.acquired) {
      result.handoff();
    }
    assert.deepEqual(messages.map((message) => message.type), ["acquired", "handoff"]);
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: previousWindow,
    });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: previousNavigator,
    });
    Object.defineProperty(globalThis, "BroadcastChannel", {
      configurable: true,
      value: previousBroadcastChannel,
    });
  }
});
