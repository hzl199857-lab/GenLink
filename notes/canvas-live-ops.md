# GenLink 当前画布操作协议

本文档记录从 `E:\infinite-canvas` 学到的可复用模式：Agent 操作当前可见画布时，应通过小型结构化操作协议完成，而不是模拟浏览器点击，也不是临时拼自由格式 JSON patch。

## 目标

为 Codex、MCP 工具和未来的本地 Agent 面板提供一套稳定方式，用于读取和修改浏览器中当前打开的画布。

这套协议应补充现有的项目级 MCP 工具：`src/lib/mcp/genlink-canvas-tools.ts`。现有工具面向项目快照和权限；live ops 面向当前 ReactFlow 画布会话，并由页面通过已有 store action 执行实际变更。

## 运行边界

推荐运行结构：

```text
Codex 或 MCP client
  -> 本地 GenLink canvas agent
  -> HTTP/SSE bridge
  -> 当前打开的 GenLink 浏览器标签页
  -> useCanvasStore actions
  -> ReactFlow canvas
```

浏览器标签页仍然是画布 UI 状态的执行边界。本地 agent 可以转发请求并接收结果，但不应直接修改 React 内部状态或项目文件。

## 最小操作集

从一个小型 discriminated union 开始。高级工具可以编译成这套底层操作。

```ts
export type GenLinkCanvasLiveOp =
  | {
      type: "create_node";
      node: {
        id?: string;
        type: string;
        position: { x: number; y: number };
        data: Record<string, unknown>;
      };
    }
  | {
      type: "update_node";
      nodeId: string;
      patch: {
        position?: { x: number; y: number };
        data?: Record<string, unknown>;
        selected?: boolean;
      };
    }
  | {
      type: "delete_nodes";
      nodeIds: string[];
    }
  | {
      type: "connect_nodes";
      edge: {
        id?: string;
        source: string;
        target: string;
        sourceHandle?: string;
        targetHandle?: string;
      };
    }
  | {
      type: "delete_edges";
      edgeIds: string[];
    }
  | {
      type: "select_nodes";
      nodeIds: string[];
    }
  | {
      type: "set_viewport";
      viewport: { x: number; y: number; zoom: number };
    }
  | {
      type: "run_node";
      nodeId: string;
    };
```

live ops 中不要包含媒体 blob、base64 payload 或服务商 API Key。媒体应先通过现有媒体 helper 上传或持久化，再通过稳定 URL / 文件元数据引用。

## 快照结构

live 读工具应返回精简快照：

```ts
export type GenLinkCanvasLiveSnapshot = {
  projectId: string | null;
  canvasId: string;
  projectName: string;
  nodes: Array<{
    id: string;
    type: string;
    position: { x: number; y: number };
    width?: number;
    height?: number;
    dataSummary: Record<string, unknown>;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
  }>;
  selectedNodeIds: string[];
  viewport: { x: number; y: number; zoom: number };
};
```

`dataSummary` 应截断长 prompt，省略大型结果 payload，只保留 Agent 推理需要的字段：标题、状态、模型、prompt 摘要、媒体类型、尺寸、输出文件名、稳定托管或本地引用。

## 建议工具层

底层工具和高级工具分开：

- `genlink_canvas_live_get_snapshot`：读取当前画布精简状态。
- `genlink_canvas_live_get_selection`：只读取当前选中节点。
- `genlink_canvas_live_apply_ops`：批量应用 `GenLinkCanvasLiveOp`。
- `genlink_canvas_live_create_workflow`：把工作流编译成创建、连线、选择等 ops。
- `genlink_canvas_live_run_node`：确认后编译为 `run_node`。

现有 `src/lib/mcp/genlink-canvas-tools.ts` 中的 `requiresConfirmation` 和权限模型仍应适用。读工具不需要确认；写入和生成工具默认需要显式确认，除非调用方是已受信任的应用内工作流。

## 前端集成点

实现时应复用已有 store action，不要复制状态逻辑：

- 创建节点走 `useCanvasStore` 里的节点创建 helper。
- 连接节点走现有 edge helper。
- 触发生成走 UI 按钮使用的同一套节点生成 action。
- 保存项目走现有项目快照持久化逻辑，不直接写文件。
- 视口变更走画布运行时中的 ReactFlow viewport API。

如果某个操作无法映射到当前 store action，应先添加聚焦的 store helper，并为该 helper 写测试，再接入 live ops。

## 错误处理

每次 apply 结果应报告每个操作的执行情况：

```ts
export type GenLinkCanvasLiveApplyResult = {
  ok: boolean;
  applied: number;
  results: Array<{
    index: number;
    ok: boolean;
    error?: string;
    nodeId?: string;
    edgeId?: string;
  }>;
  snapshot?: GenLinkCanvasLiveSnapshot;
};
```

遇到缺失必要 node id 这类破坏性校验错误时，批量执行应停止。后续如果明确需要 partial application，再支持独立非破坏操作继续执行。MVP 阶段优先采用全量校验通过后再执行，行为更简单。

## 安全边界

- 本地 bridge server 默认只监听 `127.0.0.1`。
- 浏览器连接必须携带生成的 token。
- 首次认证成功后应固定允许的 origin。
- 读快照必须隐藏 secret、API Key、auth token、本地绝对路径和完整媒体数据。
- 生成动作仍应在 Web UI 中保留用户确认。

## 初始实现顺序

1. 在 `src/lib/canvas/` 下添加纯 TypeScript 类型和校验器。
2. 为校验逻辑和精简快照摘要写测试。
3. 添加浏览器侧 adapter，将 live ops 映射到现有 `useCanvasStore` action。
4. 先暴露只读本地 bridge endpoint。
5. 在确认机制之后接入写操作。
6. 底层协议稳定后，再添加高级工作流工具。
