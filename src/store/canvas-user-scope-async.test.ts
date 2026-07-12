import assert from "node:assert/strict";
import path from "node:path";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { afterEach, test } from "node:test";

const require = createRequire(import.meta.url);
const Module = require("node:module") as typeof import("node:module") & {
  _resolveFilename(request: string, parent: NodeModule | undefined, isMain: boolean, options?: unknown): string;
};
const ts = require("typescript") as typeof import("typescript");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
  return originalResolveFilename.call(
    this,
    request.startsWith("@/") ? path.join(process.cwd(), "src", request.slice(2)) : request,
    parent,
    isMain,
    options,
  );
};
require.extensions[".ts"] = (module: NodeModule, filename: string) => {
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
    fileName: filename,
  });
  (module as NodeModule & { _compile(source: string, filename: string): void })._compile(output.outputText, filename);
};

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

const projectStorage = require("../lib/project-storage.ts") as typeof import("../lib/project-storage");
const canvas = require("./canvas-store.ts") as typeof import("./canvas-store");
const originalWindow = globalThis.window;
const originalLoadProjectSnapshot = projectStorage.loadProjectSnapshot;
const originalHydrateProjectSnapshot = projectStorage.hydrateProjectSnapshotPreviewUrls;
const originalPersistGeneratedOutput = projectStorage.persistGeneratedOutput;
const originalListProjectLibrary = projectStorage.listProjectLibrary;
const originalReadProjectHistory = projectStorage.readProjectHistory;
const originalRevokeObjectUrl = URL.revokeObjectURL;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
}

function installBrowserStorage() {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: new MemoryStorage() },
  });
}

const project = {
  id: "project-a",
  ownerUserId: "user-a",
  name: "Project A",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  directoryName: "Project A",
  projectHandle: {} as FileSystemDirectoryHandle,
  parentHandle: {} as FileSystemDirectoryHandle,
};
const snapshot = {
  id: project.id,
  name: project.name,
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
  nodes: [],
  edges: [],
  groups: [],
  materialFolders: [],
  materials: [],
};

afterEach(() => {
  projectStorage.loadProjectSnapshot = originalLoadProjectSnapshot;
  projectStorage.hydrateProjectSnapshotPreviewUrls = originalHydrateProjectSnapshot;
  projectStorage.persistGeneratedOutput = originalPersistGeneratedOutput;
  projectStorage.listProjectLibrary = originalListProjectLibrary;
  projectStorage.readProjectHistory = originalReadProjectHistory;
  URL.revokeObjectURL = originalRevokeObjectUrl;
  canvas.useCanvasStore.getState().setActiveUserId(null);
  Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
});

test("old-user project load cannot mutate state after switching accounts", async () => {
  installBrowserStorage();
  const hydrationStarted = deferred<void>();
  const hydrated = deferred<{ snapshot: typeof snapshot; previewUrls: string[] }>();
  const revoked: string[] = [];
  projectStorage.loadProjectSnapshot = async () => snapshot;
  projectStorage.hydrateProjectSnapshotPreviewUrls = async () => {
    hydrationStarted.resolve();
    return hydrated.promise;
  };
  URL.revokeObjectURL = (url) => { revoked.push(url); };
  canvas.useCanvasStore.getState().setActiveUserId("user-a");

  const operation = canvas.useCanvasStore.getState().loadProject(project);
  await hydrationStarted.promise;
  canvas.useCanvasStore.getState().setActiveUserId("user-b");
  hydrated.resolve({ snapshot, previewUrls: ["blob:old-project-preview"] });

  await assert.rejects(operation, canvas.isStaleCanvasUserScopeError);
  const state = canvas.useCanvasStore.getState();
  assert.equal(state.activeUserId, "user-b");
  assert.equal(state.projectId, null);
  assert.deepEqual(state.nodes, []);
  assert.equal(state.error, null);
  assert.equal(state.loading, false);
  assert.deepEqual(revoked, ["blob:old-project-preview"]);
});

test("logout and relogin invalidates pending work for the same user", async () => {
  installBrowserStorage();
  const loaded = deferred<typeof snapshot>();
  projectStorage.loadProjectSnapshot = async () => loaded.promise;
  projectStorage.hydrateProjectSnapshotPreviewUrls = async (_project, value) => ({ snapshot: value, previewUrls: [] });
  canvas.useCanvasStore.getState().setActiveUserId("user-a");

  const operation = canvas.useCanvasStore.getState().loadProject(project);
  canvas.useCanvasStore.getState().setActiveUserId(null);
  canvas.useCanvasStore.getState().setActiveUserId("user-a");
  loaded.resolve(snapshot);

  await assert.rejects(operation, canvas.isStaleCanvasUserScopeError);
  assert.equal(canvas.useCanvasStore.getState().projectId, null);
  assert.deepEqual(canvas.useCanvasStore.getState().nodes, []);
});

test("old-user processed results are discarded and object URLs are revoked", async () => {
  installBrowserStorage();
  const persisted = deferred<{ fileName: string; previewUrl: string; sizeBytes: number }>();
  const revoked: string[] = [];
  projectStorage.persistGeneratedOutput = async () => persisted.promise;
  URL.revokeObjectURL = (url) => { revoked.push(url); };
  canvas.useCanvasStore.getState().setActiveUserId("user-a");
  canvas.useCanvasStore.setState({
    currentProject: project,
    projectId: project.id,
    projectName: project.name,
    nodes: [{
      id: "video-a",
      type: "video",
      position: { x: 0, y: 0 },
      data: { videoUrl: "blob:source", width: 32, height: 32 },
    }],
  });

  const operation = canvas.useCanvasStore.getState().createImageNodeFromVideoFrame({
    sourceNodeId: "video-a",
    dataUrl: "data:image/png;base64,AA==",
    width: 32,
    height: 32,
  });
  canvas.useCanvasStore.getState().setActiveUserId("user-b");
  persisted.resolve({ fileName: "old.png", previewUrl: "blob:old-user", sizeBytes: 2 });

  await assert.rejects(operation, canvas.isStaleCanvasUserScopeError);
  assert.deepEqual(canvas.useCanvasStore.getState().nodes, []);
  assert.deepEqual(revoked, ["blob:old-user"]);
});

test("scoped component work cannot commit after switching accounts", async () => {
  const runScopedOperation = (
    canvas as unknown as {
      runCanvasUserScopedOperation?: <T>(params: {
        getState: () => { activeUserId: string | null; userScopeEpoch: number };
        run: (userId: string) => Promise<T>;
        commit: (value: T) => void;
      }) => Promise<T | null>;
    }
  ).runCanvasUserScopedOperation;
  assert.equal(typeof runScopedOperation, "function");

  canvas.useCanvasStore.getState().setActiveUserId("user-a");
  const created = deferred<{ id: string }>();
  const committed: string[] = [];
  const operation = runScopedOperation!({
    getState: canvas.useCanvasStore.getState,
    run: async (userId) => {
      assert.equal(userId, "user-a");
      return created.promise;
    },
    commit: (value) => { committed.push(value.id); },
  });

  canvas.useCanvasStore.getState().setActiveUserId("user-b");
  created.resolve({ id: "old-user-project" });

  assert.equal(await operation, null);
  assert.deepEqual(committed, []);
});

test("stale project listings revoke thumbnails while current listings keep them", async () => {
  installBrowserStorage();
  const listed = deferred<Array<typeof project & { thumbnailUrl?: string }>>();
  const revoked: string[] = [];
  projectStorage.listProjectLibrary = async () => listed.promise;
  URL.revokeObjectURL = (url) => { revoked.push(url); };
  canvas.useCanvasStore.getState().setActiveUserId("user-a");

  const staleOperation = canvas.useCanvasStore.getState().listProjects();
  canvas.useCanvasStore.getState().setActiveUserId("user-b");
  listed.resolve([{ ...project, thumbnailUrl: "blob:old-thumbnail" }]);

  await assert.rejects(staleOperation, canvas.isStaleCanvasUserScopeError);
  assert.deepEqual(revoked, ["blob:old-thumbnail"]);

  projectStorage.listProjectLibrary = async () => [{ ...project, thumbnailUrl: "blob:current-thumbnail" }];
  const currentProjects = await canvas.useCanvasStore.getState().listProjects();
  assert.equal(currentProjects[0]?.thumbnailUrl, "blob:current-thumbnail");
  assert.deepEqual(revoked, ["blob:old-thumbnail"]);
});

test("stale project history revokes previews while current history keeps them", async () => {
  installBrowserStorage();
  const history = deferred<Array<{ id: string; previewUrl: string }>>();
  const revoked: string[] = [];
  projectStorage.readProjectHistory = async () => history.promise as never;
  URL.revokeObjectURL = (url) => { revoked.push(url); };
  canvas.useCanvasStore.getState().setActiveUserId("user-a");
  canvas.useCanvasStore.setState({ currentProject: project, projectId: project.id });

  const staleOperation = canvas.useCanvasStore.getState().listCurrentProjectHistory();
  canvas.useCanvasStore.getState().setActiveUserId("user-b");
  history.resolve([{ id: "old-history", previewUrl: "blob:old-history" }]);

  await assert.rejects(staleOperation, canvas.isStaleCanvasUserScopeError);
  assert.deepEqual(revoked, ["blob:old-history"]);

  canvas.useCanvasStore.setState({ currentProject: project, projectId: project.id });
  projectStorage.readProjectHistory = async () => [{ id: "current-history", previewUrl: "blob:current-history" }] as never;
  const currentHistory = await canvas.useCanvasStore.getState().listCurrentProjectHistory();
  assert.equal(currentHistory[0]?.previewUrl, "blob:current-history");
  assert.deepEqual(revoked, ["blob:old-history"]);
});

test("scoped component work cannot commit after logout and same-user relogin", async () => {
  const runScopedOperation = (
    canvas as unknown as {
      runCanvasUserScopedOperation: <T>(params: {
        getState: () => { activeUserId: string | null; userScopeEpoch: number };
        run: (userId: string) => Promise<T>;
        commit: (value: T) => void;
      }) => Promise<T | null>;
    }
  ).runCanvasUserScopedOperation;
  assert.equal(typeof runScopedOperation, "function");

  canvas.useCanvasStore.getState().setActiveUserId("user-a");
  const created = deferred<{ id: string }>();
  const committed: string[] = [];
  const operation = runScopedOperation({
    getState: canvas.useCanvasStore.getState,
    run: async () => created.promise,
    commit: (value) => { committed.push(value.id); },
  });

  canvas.useCanvasStore.getState().setActiveUserId(null);
  canvas.useCanvasStore.getState().setActiveUserId("user-a");
  created.resolve({ id: "stale-project" });

  assert.equal(await operation, null);
  assert.deepEqual(committed, []);
});

test("both canvas project create entry points use scoped component work", () => {
  for (const fileName of [
    "src/components/project/ProjectLibrary.tsx",
    "src/components/canvas/InfiniteCanvas.tsx",
  ]) {
    const sourceText = readFileSync(path.join(process.cwd(), fileName), "utf8");
    assert.match(sourceText, /await runCanvasUserScopedOperation\(/, `${fileName} must guard project creation`);
    assert.match(sourceText, /commit: \(result\) => attachProject\(/, `${fileName} must attach only inside the guard`);
  }
});

test("all async canvas actions use the shared user-scope guard", () => {
  const sourceText = readFileSync(path.join(process.cwd(), "src/store/canvas-store.ts"), "utf8");
  const sourceFile = ts.createSourceFile("canvas-store.ts", sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const expectedActions = [
    "generateTextFromTextNode", "generateStoryboardFromStoryboardNode", "generateImageFromImageGenerationNode",
    "generateVideoFromVideoGenerationNode", "generateAudioFromAudioGenerationNode", "separateAudioFromNode",
    "runVideoUpscaleFromNode", "splitImageGenerationNodeToGrid", "cropImageGenerationNode",
    "splitUploadedImageNodeToGrid", "cropUploadedImageNode", "splitImageNodeToGrid", "cropImageNode",
    "createVideoNodeFromProcessedResult", "createImageNodeFromVideoFrame", "generateThreeViewImageFromNode",
    "createPanorama360ScreenshotNode", "createDirectorDeskCaptureNode", "createPanorama360FromImageNode",
    "saveProject", "loadProject", "listProjects", "deleteProject", "renameProject", "duplicateProject",
    "persistProjectOutput", "listCurrentProjectHistory",
  ];
  const actions = new Map<string, import("typescript").ArrowFunction>();

  function visit(node: import("typescript").Node) {
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      ts.isArrowFunction(node.initializer) &&
      node.initializer.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword) &&
      expectedActions.includes(node.name.text)
    ) {
      actions.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  assert.deepEqual([...actions.keys()].sort(), [...expectedActions].sort());
  for (const name of expectedActions) {
    const action = actions.get(name)!;
    const bodyText = action.body.getText(sourceFile);
    assert.match(bodyText, /const scope = captureCanvasUserScope\(get, set\);/, `${name} must capture user scope`);

    function inspect(node: import("typescript").Node) {
      if (ts.isAwaitExpression(node)) {
        assert.match(node.expression.getText(sourceFile), /^scope\.wait\(/, `${name} has an unguarded await`);
      }
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "set") {
        assert.fail(`${name} has a direct unguarded set()`);
      }
      if (ts.isCatchClause(node)) {
        const catchText = node.block.getText(sourceFile);
        if (/scope\.set\(|get\(\)\.setSaveMessage\(/.test(catchText)) {
          assert.match(catchText, /isStaleCanvasUserScopeError/, `${name} catch can write a stale error`);
        }
      }
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "catch"
      ) {
        const catchText = node.arguments[0]?.getText(sourceFile) ?? "";
        if (/setSaveMessage\(/.test(catchText)) {
          assert.match(catchText, /isStaleCanvasUserScopeError/, `${name} promise catch can write a stale message`);
        }
      }
      ts.forEachChild(node, inspect);
    }
    inspect(action.body);
  }
});
