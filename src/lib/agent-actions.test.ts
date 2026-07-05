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

  module._compile(output.outputText, filename);
};

const {
  attachExistingSourceReferencesToImageActions,
  restoreReferenceMentionLabelsInActions,
} = require("./agent-actions.ts") as typeof import("./agent-actions");

function imageAttachment(id: string, name: string, sourceNodeId: string) {
  return {
    id,
    kind: "image" as const,
    name,
    mimeType: "image/png",
    imageUrl: "",
    previewUrl: "",
    status: "ready" as const,
    sourceNodeId,
  };
}

test("replaces hallucinated existing source connections with real attachment source nodes", () => {
  const actions = attachExistingSourceReferencesToImageActions(
    [
      {
        type: "create_image_generation_node",
        clientActionId: "image-1",
        prompt: "prompt 1",
      },
      {
        type: "create_image_generation_node",
        clientActionId: "image-2",
        prompt: "prompt 2",
      },
      {
        type: "connect_nodes",
        sourceRef: { kind: "existing", nodeId: "node-hallucinated" },
        targetRef: { kind: "created", clientActionId: "image-1" },
      },
    ],
    ["node-real-source"],
  );

  assert.equal(
    actions.some((action) => (
      action.type === "connect_nodes" &&
      action.sourceRef.kind === "existing" &&
      action.sourceRef.nodeId === "node-hallucinated"
    )),
    false,
  );
  assert.deepEqual(
    actions.filter((action) => action.type === "connect_nodes"),
    [
      {
        type: "connect_nodes",
        sourceRef: { kind: "existing", nodeId: "node-real-source" },
        targetRef: { kind: "created", clientActionId: "image-1" },
      },
      {
        type: "connect_nodes",
        sourceRef: { kind: "existing", nodeId: "node-real-source" },
        targetRef: { kind: "created", clientActionId: "image-2" },
      },
    ],
  );
});

test("restores explicit reference mention labels in generated image prompts", () => {
  const actions = restoreReferenceMentionLabelsInActions(
    [
      {
        type: "create_image_generation_node",
        clientActionId: "image-1",
        prompt: "基于参考图1进行局部重绘，去掉眼镜，并参考图2中的墨镜款式。",
      },
    ],
    "去掉 [[ref:att-1:%E5%9B%BE%E7%89%871]] 图中人物的眼镜然后戴上 [[ref:att-2:%E5%9B%BE%E7%89%872]] 这个墨镜",
    [
      imageAttachment("att-1", "person.png", "source-node-1"),
      imageAttachment("att-2", "sunglasses.png", "source-node-2"),
    ],
  );

  assert.deepEqual(actions, [
    {
      type: "create_image_generation_node",
      clientActionId: "image-1",
      prompt: "基于[[ref:source-node-1:%E5%9B%BE%E7%89%871]]进行局部重绘，去掉眼镜，并[[ref:source-node-2:%E5%9B%BE%E7%89%872]]中的墨镜款式。",
    },
  ]);
});

test("prefixes missing explicit reference mention labels in generated image prompts", () => {
  const actions = restoreReferenceMentionLabelsInActions(
    [
      {
        type: "create_image_generation_node",
        clientActionId: "image-1",
        prompt: "进行局部重绘，去掉人物原本眼镜并换成墨镜。",
      },
    ],
    "去掉 [[ref:att-1:%E5%9B%BE%E7%89%871]] 图中人物的眼镜然后戴上 [[ref:att-2:%E5%9B%BE%E7%89%872]] 这个墨镜",
    [
      imageAttachment("att-1", "person.png", "source-node-1"),
      imageAttachment("att-2", "sunglasses.png", "source-node-2"),
    ],
  );

  assert.deepEqual(actions, [
    {
      type: "create_image_generation_node",
      clientActionId: "image-1",
      prompt: "参考图：[[ref:source-node-1:%E5%9B%BE%E7%89%871]]、[[ref:source-node-2:%E5%9B%BE%E7%89%872]]。进行局部重绘，去掉人物原本眼镜并换成墨镜。",
    },
  ]);
});

test("orders node references and labels by each image node connection order", () => {
  const restoredActions = restoreReferenceMentionLabelsInActions(
    [
      {
        type: "create_image_generation_node",
        clientActionId: "image-1",
        prompt: "以参考图2中的人物为主，穿上参考图3的上衣，并手持参考图1中的提包。",
      },
    ],
    "以 [[ref:att-2:%E5%9B%BE%E7%89%872]] 中的人物为主，穿上 [[ref:att-3:%E5%9B%BE%E7%89%873]] 的上衣，并手持 [[ref:att-1:%E5%9B%BE%E7%89%871]] 中的提包。",
    [
      imageAttachment("att-1", "bag.png", "source-node-1"),
      imageAttachment("att-2", "person.png", "source-node-2"),
      imageAttachment("att-3", "top.png", "source-node-3"),
    ],
  );
  const actions = attachExistingSourceReferencesToImageActions(
    restoredActions,
    ["source-node-1", "source-node-2", "source-node-3"],
  );

  assert.deepEqual(actions, [
    {
      type: "create_image_generation_node",
      clientActionId: "image-1",
      prompt: "以[[ref:source-node-2:%E5%9B%BE%E7%89%871]]中的人物为主，穿上[[ref:source-node-3:%E5%9B%BE%E7%89%872]]的上衣，并手持[[ref:source-node-1:%E5%9B%BE%E7%89%873]]中的提包。",
    },
    {
      type: "connect_nodes",
      sourceRef: { kind: "existing", nodeId: "source-node-2" },
      targetRef: { kind: "created", clientActionId: "image-1" },
    },
    {
      type: "connect_nodes",
      sourceRef: { kind: "existing", nodeId: "source-node-3" },
      targetRef: { kind: "created", clientActionId: "image-1" },
    },
    {
      type: "connect_nodes",
      sourceRef: { kind: "existing", nodeId: "source-node-1" },
      targetRef: { kind: "created", clientActionId: "image-1" },
    },
  ]);
});
