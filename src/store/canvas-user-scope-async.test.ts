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

test("old-project processed results cannot overwrite the newly opened project", async () => {
  installBrowserStorage();
  const persisted = deferred<{ fileName: string; previewUrl: string; sizeBytes: number }>();
  const revoked: string[] = [];
  const targetProject = { ...project, id: "project-b", name: "Project B" };
  const targetNodes = [{
    id: "target-project-node",
    type: "text" as const,
    position: { x: 10, y: 20 },
    data: { text: "keep project B" },
  }];
  projectStorage.persistGeneratedOutput = async () => persisted.promise;
  URL.revokeObjectURL = (url) => { revoked.push(url); };
  canvas.useCanvasStore.getState().setActiveUserId("user-a");
  canvas.useCanvasStore.setState({
    currentProject: project,
    projectId: project.id,
    activeCanvasId: "canvas-a",
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
  canvas.useCanvasStore.setState({
    currentProject: targetProject,
    projectId: targetProject.id,
    activeCanvasId: "canvas-b",
    nodes: targetNodes,
  });
  persisted.resolve({ fileName: "old-project.png", previewUrl: "blob:old-project", sizeBytes: 2 });

  await assert.rejects(operation, canvas.isStaleCanvasUserScopeError);
  const state = canvas.useCanvasStore.getState();
  assert.equal(state.projectId, targetProject.id);
  assert.equal(state.activeCanvasId, "canvas-b");
  assert.deepEqual(state.nodes, targetNodes);
  assert.deepEqual(revoked, ["blob:old-project"]);
});

test("old-canvas processed results cannot overwrite the newly active canvas", async () => {
  installBrowserStorage();
  const persisted = deferred<{ fileName: string; previewUrl: string; sizeBytes: number }>();
  const revoked: string[] = [];
  const targetNodes = [{
    id: "target-canvas-node",
    type: "text" as const,
    position: { x: 30, y: 40 },
    data: { text: "keep canvas B" },
  }];
  projectStorage.persistGeneratedOutput = async () => persisted.promise;
  URL.revokeObjectURL = (url) => { revoked.push(url); };
  canvas.useCanvasStore.getState().setActiveUserId("user-a");
  canvas.useCanvasStore.setState({
    currentProject: project,
    projectId: project.id,
    activeCanvasId: "canvas-a",
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
  canvas.useCanvasStore.setState({ activeCanvasId: "canvas-b", nodes: targetNodes });
  persisted.resolve({ fileName: "old-canvas.png", previewUrl: "blob:old-canvas", sizeBytes: 2 });

  await assert.rejects(operation, canvas.isStaleCanvasUserScopeError);
  const state = canvas.useCanvasStore.getState();
  assert.equal(state.projectId, project.id);
  assert.equal(state.activeCanvasId, "canvas-b");
  assert.deepEqual(state.nodes, targetNodes);
  assert.deepEqual(revoked, ["blob:old-canvas"]);
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

test("project listings remain current when only the active canvas changes", async () => {
  installBrowserStorage();
  const listed = deferred<Array<typeof project & { thumbnailUrl?: string }>>();
  const revoked: string[] = [];
  projectStorage.listProjectLibrary = async () => listed.promise;
  URL.revokeObjectURL = (url) => { revoked.push(url); };
  canvas.useCanvasStore.getState().setActiveUserId("user-a");
  canvas.useCanvasStore.setState({ projectId: project.id, activeCanvasId: "canvas-a" });

  const operation = canvas.useCanvasStore.getState().listProjects();
  canvas.useCanvasStore.setState({ activeCanvasId: "canvas-b" });
  listed.resolve([{ ...project, thumbnailUrl: "blob:project-thumbnail" }]);

  const projects = await operation;
  assert.equal(projects[0]?.thumbnailUrl, "blob:project-thumbnail");
  assert.deepEqual(revoked, []);
  assert.equal(canvas.useCanvasStore.getState().activeCanvasId, "canvas-b");
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

test("all project create entry points use scoped component work", () => {
  for (const fileName of [
    "src/components/project/ProjectLibrary.tsx",
    "src/components/canvas/InfiniteCanvas.tsx",
    "src/app/page.tsx",
  ]) {
    const sourceText = readFileSync(path.join(process.cwd(), fileName), "utf8");
    assert.match(sourceText, /await runCanvasUserScopedOperation\(/, `${fileName} must guard project creation`);
    assert.match(
      sourceText,
      /commit: \(result\) => (?:attachProject\(|\{[\s\S]*?attachProject\(result\.project, result\.snapshot\);[\s\S]*?\})/,
      `${fileName} must attach only inside the guard`,
    );
  }
});

test("async canvas actions use guards matching their data ownership", () => {
  const sourceText = readFileSync(path.join(process.cwd(), "src/store/canvas-store.ts"), "utf8");
  const sourceFile = ts.createSourceFile("canvas-store.ts", sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const canvasOperationActions = [
    "generateTextFromTextNode", "generateStoryboardFromStoryboardNode", "generateImageFromImageGenerationNode",
    "upscaleMidjourneyGridImage", "generateVideoFromVideoGenerationNode", "generateAudioFromAudioGenerationNode", "separateAudioFromNode",
    "runVideoUpscaleFromNode", "splitImageGenerationNodeToGrid", "cropImageGenerationNode",
    "splitUploadedImageNodeToGrid", "cropUploadedImageNode", "splitImageNodeToGrid", "cropImageNode",
    "createVideoNodeFromProcessedResult", "createImageNodeFromVideoFrame", "generateThreeViewImageFromNode",
    "createPanorama360ScreenshotNode", "createDirectorDeskCaptureNode", "createPanorama360FromImageNode",
    "persistProjectOutput", "saveProject", "loadProject", "switchCanvas", "createCanvas", "renameCanvas", "duplicateCanvas",
  ];
  const projectActions = ["listCurrentProjectHistory"];
  const userActions = ["listProjects", "deleteProject", "renameProject", "duplicateProject"];
  const exemptActions = new Map([
    ["deleteCanvas", "switching the active canvas intentionally changes scope before the delegated scoped save"],
  ]);
  const expectedScopes = new Map([
    ...canvasOperationActions.map((name) => [name, "captureCanvasOperationScope"] as const),
    ...projectActions.map((name) => [name, "captureCanvasProjectScope"] as const),
    ...userActions.map((name) => [name, "captureCanvasUserScope"] as const),
  ]);
  const expectedActions = [...expectedScopes.keys(), ...exemptActions.keys()];
  const actions = new Map<string, import("typescript").ArrowFunction>();
  const storeStart = sourceText.indexOf("export const useCanvasStore");

  function visit(node: import("typescript").Node) {
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      ts.isArrowFunction(node.initializer) &&
      node.initializer.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword) &&
      node.getStart(sourceFile) > storeStart
    ) {
      actions.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  assert.deepEqual([...actions.keys()].sort(), [...expectedActions].sort());
  for (const [name, reason] of exemptActions) {
    assert.ok(actions.has(name), `${name} exemption must reference a store async action`);
    assert.ok(reason.length > 20, `${name} exemption must explain the ownership exception`);
  }
  for (const [name, expectedScope] of expectedScopes) {
    const action = actions.get(name)!;
    const bodyText = action.body.getText(sourceFile);
    assert.match(
      bodyText,
      new RegExp(`const scope = ${expectedScope}\\(get, set\\);`),
      `${name} must capture ${expectedScope}`,
    );
    let scopeDeclarationEnd = action.body.getStart(sourceFile);

    function findScopeDeclaration(node: import("typescript").Node) {
      if (
        ts.isVariableDeclaration(node)
        && ts.isIdentifier(node.name)
        && node.name.text === "scope"
      ) {
        scopeDeclarationEnd = node.getEnd();
        return;
      }
      ts.forEachChild(node, findScopeDeclaration);
    }
    findScopeDeclaration(action.body);

    function inspect(node: import("typescript").Node) {
      if (ts.isAwaitExpression(node) && node.getStart(sourceFile) > scopeDeclarationEnd) {
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
