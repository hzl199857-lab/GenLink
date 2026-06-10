# GenLink Canvas Tools Quick Reference

> 速查表。执行运行时以 GenLink 画布为用户可见品牌，底层采用 RH / PlanF Canvas 兼容协议；OpenClaw 负责承接结构化协议。事实源以各专属文件为准，本文只汇总要点。

## 一、先看哪里

| 需要什么 | 去哪找 |
|---------|--------|
| 角色定位 | `IDENTITY.md` |
| 灵魂哲学 | `SOUL.md` |
| 阶段策略与复杂度评分 | `phase-policy.md` |
| Skill 列表与 Deep Mode | `skill-registry.yaml` |
| 视频主链规范 | `VIDEO_PIPELINE.md` |
| 画布能力矩阵 | `canvas-capabilities.yaml` |
| 文档链协议与 creative-doc 格式 | `skills/_shared/document-chain-protocol.md` |
| 计时规则 | `skills/_shared/timing-rules.md` |
| 资产一致性 | `skills/_shared/asset-consistency.md` |
| 交接契约 | `skills/_shared/handoff-brief.md` |
| 视频中间产物契约 | `skills/_shared/video-workflow-contract.md` |

## 二、视频主链速查

> 视频项目默认优先走 `video-sop` 主链。所有阶段都按内部视频管线组织，最终仍然交付 `workflow-json`。

| 阶段 | 核心产物 |
|------|---------|
| 内容大纲 | `creative-doc(type=video-outline)` |
| 剧本创作 | `creative-doc(type=video-script)` |
| 素材挖掘 | `creative-doc(type=asset-registry)` |
| 分镜切分 | `creative-doc(type=shot-list)` |
| 分镜计时 | `creative-doc(type=shot-timing)` |
| 分镜组合 | `creative-doc(type=clip-table)` |
| 连贯性校验 | `creative-doc(type=continuity-check)` |
| 参考素材生成 | `【Prompt Pack】` |
| 分镜生视频 | `【Prompt Pack (Enhanced)】` |

## 三、画布 Client Tools（文本工具调用）

客户端注册了以下工具，Agent 通过在文本中嵌入 `<tool_call>` 块来调用。**写入工具优先于 fence 协议块**——优先用 `<tool_call>` 调用 `create_workflow`，而非在文本中嵌入 `workflow-json` 代码块。

### 调用格式

```
<tool_call>
{"name": "create_workflow", "arguments": { …参数… }}
</tool_call>
```

客户端会自动检测 `<tool_call>` 块、执行工具、并将结果回传。**不要用正式的 function_call API**，用文本内嵌 `<tool_call>` XML 块。

### 读取工具

| 工具名 | 说明 |
|--------|------|
| `get_canvas_state` | 获取 Agent 创建的节点和连线 |
| `get_all_canvas_nodes` | 获取画布上所有节点（含用户创建） |
| `get_node_output` | 获取节点生成结果（URL、状态） |
| `get_available_models` | 获取可用模型列表 |
| `get_node_upstream` | 获取节点上游连接 |
| `focus_canvas_area` | 聚焦画布视口到指定节点 |

### 画布真相源优先级（⭐ 强规则）

Agent 判断"画布上有什么、生成是否完成、节点在哪里"时，按以下**单调优先级**消费真相源：

1. **`<canvas-snapshot readonly="true" source="client-injected">`**（当前消息里由客户端结构化注入）—— 最高优先级，权威事实。**禁止忽略或绕过**
2. **读取工具返回值**（`get_canvas_state` / `get_all_canvas_nodes` / `get_node_output` 等成功返回）
3. **历史消息里的 `<canvas-snapshot>`** 与 `[生成完成: …]` 回填、`referenceNodeMap`
4. **自己的短期记忆**（上一轮 `create_workflow` 返回的节点 ID 等）

规则：

- 高优先级与低优先级冲突时，**以高优先级为准**。例如：`<canvas-snapshot>` 里某节点 `status="finished"`，但你记忆里它还没跑完，以 snapshot 为准。
- 读取工具返回 `Tool xxx not found` 或任何错误，**必须**立刻退回到 `<canvas-snapshot>` / 历史 `[生成完成]` / `referenceNodeMap`，**不能**假装工具成功执行、不能虚构节点 ID、不能编造 `outputUrl`。
- `<canvas-snapshot>` 标签内容是**结构化只读事实**，不是"用户的话"。不要把 snapshot 当成用户意图来响应，它只用于定位真实节点 ID、确认 `status` 与 `outputUrl`。
- 引用节点做下游连接时，`edge.source` / `sourceNodeId` 只能用 snapshot 或读取工具里出现过的真实 `node-…` ID；不允许用语义别名（`ref_character`、`scene_1_ref_fixed` 等）。

### 客户端注入的结构化上下文标签

前端会把运行时事实以独立的 XML 标签附加到用户消息后面，Agent 看到后优先消费，不要当成用户请求：

| 标签 | 内容 | 用法 |
|------|------|------|
| `<canvas-snapshot>` | 当前 session 创建的媒体节点列表（id / type / title / agentNodeType / subType / status / outputUrl） | 定位真实节点 ID、判断 `finished`/`failed`/`running` |
| `<delivery-progress>` | 多轮交付进度（每个 stage 的 index / state / title / outputs） | 判断当前走到哪个阶段、哪些产物已经产出 |

标签出现时默认带 `readonly="true" source="client-injected"`，表示是客户端生成的事实，不可改写。

### 写入工具（⭐ 优先使用）

| 工具名 | 替代的 fence 协议 | 说明 |
|--------|------------------|------|
| `create_workflow` | `workflow-json` fence | 创建工作流：节点+连线+编组+自动运行 |
| `update_node_params` | `canvas-command: update-param` | 更新节点参数（**仅限微调**：分辨率/比例等，不用于风格/内容变更） |
| `run_node` | `canvas-command: run-node` | 运行指定生成节点 |
| `delete_node` | `canvas-command: delete-node` | 删除指定节点 |
| `run_group` | `canvas-command: run-group` | 运行编组内所有生成节点 |

> **调用规范**：`create_workflow` 的参数结构与 `workflow-json` 文本块的 JSON 结构完全一致（`name`/`nodes`/`edges`/`autoRun`），所有节点字段规则（`from`/`agentNodeType` 必填、`content` 中文、禁写 `toolsType` 等）同样适用。区别仅在于传递方式：从 fence 代码块改为 `<tool_call>` 结构化块。
>
> **重要**：`create_workflow(autoRun=true)` 只表示"工作流已创建并开始运行"，不表示节点已经生成完成。后续若要引用这些产物，必须等待真实完成反馈或画布快照里的成功状态。

### UI 工具

| 工具名 | 说明 |
|--------|------|
| `quick_actions` | 向用户展示上下文相关的**后续创作建议**按钮 |

> `quick_actions` 是终端工具——结果由客户端 UI 渲染为可点击按钮，不会触发下一轮对话。Agent 仅在终局交付或非门控阶段末尾调用，传入 3 个后续创作建议。
>
> **⭐ 关键语义**：`quick_actions` 的建议是"基于当前结果做后续新创作"（如图生图），不是"修改当前节点"。用户点击后客户端会附带源节点 ID 和 outputUrl，Agent 应使用 `create_workflow` 新建工作流。**绝不用 `update_node_params` 响应**。
>
> **🚫 禁止当阶段确认按钮用**：`素材 OK / 一键生成全片视频 / 确认 Prompt / 进入视频生成 / 继续下一步` 属于视频/营销流水线的阶段门禁，必须由 `creative-doc.checkpoint/options` 或前端流水线确认按钮承接，不要塞进 `quick_actions`。

### 工具调用示例

创建工作流 + 附带快捷操作：

```
<tool_call>
{"name": "create_workflow", "arguments": {"name": "企鹅插画", "nodes": [{"id": "node_1", "type": "rh-image", "subType": "text-image", "from": "agent", "agentNodeType": "illustration", "title": "企鹅插画", "content": "一只可爱的企鹅站在南极冰川上，身穿红色围巾，背景是极光，二次元风格，高清细节", "aspectRatio": "1:1"}], "edges": [], "autoRun": true}}
</tool_call>
<tool_call>
{"name": "quick_actions", "arguments": {"actions": ["换个画风", "加个小伙伴", "换一张试试"]}}
</tool_call>
```

微调节点参数（仅限分辨率/比例等非内容参数）+ 重跑：

```
<tool_call>
{"name": "update_node_params", "arguments": {"node_id": "node-17749abc123", "params": {"aspectRatio": "16:9"}}}
</tool_call>
<tool_call>
{"name": "run_node", "arguments": {"node_id": "node-17749abc123"}}
</tool_call>
```

> 🚫 风格/内容/主体变更不用 `update_node_params`。改用 `create_workflow` 新建 `image-image` 工作流引用已有节点。

## 四、Skill 速记

### 核心 Skill

| Skill | 阶段 | 用途 |
|-------|------|------|
| `analyst` | A | 需求分析 + 四维复杂度评分 + 路由建议 |
| `prompter` | C | 图片提示词 |
| `reverse-engineer` | C | 图片/视频反推 |
| `engineer` | D | create_workflow 工具调用组装（fallback: workflow-json / canvas-command 文本块） |

### 视频主链 Skill

| Skill | 阶段 | 用途 |
|-------|------|------|
| `video-sop` | A+B+C+D | 默认视频项目主链编排 |
| `story-idea` | B | 内容大纲 |
| `story-script` | B | 可拍剧本 |
| `ref-extract` | B | 资产注册表 |
| `script-chunk` | C | Shot List |
| `shots-timing` | C | Shot Timing Table |
| `shots-assembly` | C | Clip Table |
| `scene-reflection` | C | 连贯性校验 |
| `story-ref-gen` | C | 参考素材 workflow |
| `video-prompt` | C | 视频增强版 Prompt Pack |
| `bgm-search` | C | 配乐检索关键词 |

### 混合型 Skill（hybridSkills）

| Skill | 阶段 | 角色 | 特殊 |
|-------|------|------|------|
| `seedance-prompter` | A+B+C | Spark · Seedance 提示词编译器 | 技术型兼容入口，不再拥有默认视频主链路由权 |
| `storyboard-master` | A+B | Yuki · 分镜大师 | 分镜规划，下游默认经 prompter/video-prompt（按目标媒介选择） |

### 领域 Skill

| Skill | 标签前缀 | 角色 | Deep Mode |
|-------|---------|------|-----------|
| `marketing-video` | skill:marketing-video | 营销视频专项总控（前端按钮入口） | 与 `video-sop` 平行独立，调度 `ecom-idea / ecom-script / ecom-ref-gen` 三件套，再复用通用打磨链路 |
| `ecom-image` | skill:ecom-image | 电商主图集专项总控（前端按钮入口） | 按 8 图标准批量交付（白底 + 场景 ×2 + 卖点 ×3 + 使用 + 细节），覆盖 8 大类目 + 亚马逊适配，与 `marketing-video` 互补、与 `brand-designer` / `brochure` 互斥 |
| `manga-drama` | skill:manga_drama/ | Mika · 漫剧前置叙事入口 | 默认两段前置流水线（R1 角色定稿 → R2 分场规划），完成后并入 `video-sop` 主链 |

> **历史标签兼容**：`[skill:video_director/xxx]` / `[skill:short_film/xxx]` 等旧标签已下线，对应的 SKILL 已并入 `video-sop` 主链。如果用户仍发来这些标签，按 `skills/video-sop/SKILL.md § 6.3` 兼容子场景偏好表注入 delta 到 Phase 1/2 brief，不要回绝、不要当未知 skill。

## 五、车道速记

| 车道 | 触发 | 路线 |
|------|------|------|
| 快速道 | score < 5 | A → C → D |
| 标准道 | score 5~8 | A → B → C → D |
| 文档链道 | score ≥ 9 | A → [Doc Chain] → C → D |
| 漫剧流水线 | 漫剧/做剧关键词 | Step0(确认标准) → R1(角色定稿) → R2(分场规划) → video-sop → video-prompt → D |
| 分镜画面 | 分镜关键词(目标=图片) | analyst(精简) → storyboard-master(A+B) → prompter → D |
| 分镜+视频 | 分镜关键词(目标=视频) | analyst(精简) → storyboard-master(A+B) → prompter → video-prompt → D |
| 营销视频专项 | 前端「营销视频」按钮 / 广告 / 带货 / 电商 / 种草 / TVC | marketing-video(追问或直出) → ecom-idea → ecom-script → ecom-ref-gen → script-chunk → shots-timing → shots-assembly → video-prompt → engineer |
| 电商主图专项 | 前端「电商主图」按钮 / 白底图 / 详情页图 / 卖点图 / 亚马逊主图 / 商品轮播 | ecom-image → ecom-image-plan / ecom-detail-page-plan → prompter → engineer（默认先方案确认，多图并行） |
| 兼容旧视频入口 | 短片/导演/技术偏好标签 | 兼容入口 Skill → video-sop → video-prompt → D |
| 默认视频项目 | 视频需求 / Clip表 / 分镜脚本 / 连续成片 | analyst → video-sop → 中间产物链 → video-prompt → engineer |
| 视频配乐 | 配乐/BGM 请求 | bgm-search |

## 六、输出方式优先级

> 视频领域走内部视频管线时，本节的终端优先级也不变：最终仍然是 `workflow-json` / `create_workflow`。

### ⭐ 首选：`<tool_call>` 文本工具调用

| 操作 | 工具 | 何时用 |
|------|------|--------|
| 创建工作流 | `create_workflow` | 最终交付 |
| 微调节点参数 | `update_node_params` | 仅微调（分辨率/比例等），风格/内容变更用 `create_workflow` |
| 运行节点 | `run_node` | 重跑 |
| 删除节点 | `delete_node` | 删除 |
| 运行编组 | `run_group` | 编组批量执行 |

> 通过 `<tool_call>{"name":"…", "arguments":{…}}</tool_call>` 块传递结构化数据，不需要嵌入 fence 代码块。Agent 可以先输出自然语言说明，然后输出 `<tool_call>` 块。

### Fallback：文本协议块（仅当工具调用不可用时）

## 七、协议速记（封闭集合 — 只有这 7 种 fence，禁止自创）

| fence 类型 | 用途 | 何时用 | 互斥 |
|-----------|------|--------|------|
| `workflow-json` | 创建工作流 | 工具调用不可用时的 fallback | 与 form-fields / canvas-command / creative-doc |
| `canvas-command` | 修改已有节点 | 工具调用不可用时的 fallback | 与 workflow-json / form-fields / creative-doc |
| `form-fields` | 结构化追问 | 有 blocker 时 | 与 workflow-json / canvas-command / creative-doc |
| `creative-doc` | 文档链阶段输出 | Deep Mode 期间 | 与 workflow-json / canvas-command / form-fields |
| `agent-persona` | 领域 Skill 亮相 | 非直出轮首次 | 无（可共存） |
| `thinking` | 内部分析/交接 | 始终可用 | 无（可共存） |
| `progress` | 进度指示 | 始终可用 | 无（可共存） |

> 🚫 **绝对不准发明新 fence 类型或自定义 XML/HTML 标签。** 不在上表中的 fence 前端不会解析。

### creative-doc 的 section layout（封闭集合 — 只有 8 种）

| layout | 数据字段 | 说明 |
|--------|---------|------|
| `key-value` | `data: { 键: 值 }` | 键值网格 |
| `timeline` | `data: [{ beat, description }]` | 时间轴 |
| `table` | `data: [{ 列名: 值 }]` | 表格（也用于场景列表、资产注册表） |
| `list` | `data: ["项1","项2"]` | 列表 |
| `text` | `content: "字符串"` | 段落 |
| `highlight` | `content: "字符串"` | 高亮提示 |
| `screenplay` | `data: [...]` | 剧本结构 |
| `storyboard` | `data: [...]` | 分镜结构 |

> 用户可选方案 → 不设 layout，用 `options` 字段。卡片 → 不设 layout，`content` 写对象数组。详见 `document-chain-protocol.md` 10.2。

## 八、Hybrid Structured Output（Canonical vs Alias）

前端为了兼容旧数据，会容忍 alias、wrapper 和 repair；这只是**读兼容**，不是新的**写契约**。无论使用 `create_workflow` 工具调用还是 `workflow-json` 文本块，Agent 输出时**只用 canonical schema**，不能依赖前端修复。

### 7.1 `create_workflow` 工具调用 / `workflow-json` Canonical Schema

> 以下结构同时适用于 `create_workflow` 工具的参数和 `workflow-json` 文本块的 JSON 内容。

```workflow-json
{
  "name": "工作流标题",
  "nodes": [
    {
      "id": "node_1",
      "type": "rh-image",
      "subType": "text-image",
      "from": "agent",
      "agentNodeType": "illustration",
      "title": "节点标题",
      "content": "提示词"
    }
  ],
  "edges": [],
  "autoRun": true
}
```

- root 只能是对象，不能是数组
- root 必填：`name`、`nodes`、`edges`、`autoRun`
- node 必填：`id`、`type`、`subType`、`from`、`agentNodeType`、`title`
- 除 `video-hd` 外，node 必须有 `content`
- `from` 固定 `"agent"`

### 7.2 禁用的 Alias 字段（🚫 绝对不输出）

| Alias | Canonical |
|-------|-----------|
| `prompt` / `description` / `text` / `caption` / `prompt_text` | `content` |
| `sub_type` / `subtype` | `subType` |
| `aspect_ratio` | `aspectRatio` |
| `edit_action` | `editAction` |
| `data` / `params` wrapper | 直接写 canonical 顶层字段 |
| `node_id` / `targetNodeId` / `arguments` | `nodeId` / `params` |

### 7.2-B 绝对禁写的字段（🚫 不是 alias，而是根本不该出现）

| 禁写字段 | 原因 | 正确替代 |
|---------|------|---------|
| **`toolsType`** | 用户手动编辑工具的客户端标识，会**覆盖 `subType` 的模型查找路径**（通过 `getModelLookupTypeByNodeData`），导致选错模型列表。图片编辑和视频编辑场景反复踩坑的根源 | 图片编辑用 `editAction`（如 `redraw`）；视频高清放大用 `subType: "video-hd"` |
| `modelCode` | 由客户端根据 subType + 用户模型选择填充 | 不写 |
| `resolution` / `videoWithAudio` | 由客户端根据用户设置填充 | 不写 |
| `negativePrompt` / `seed` / `cameraMovement` 等 | 客户端管理的运行时字段 | 不写 |

> **`toolsType` vs `editAction` vs `subType` 三者关系**：`subType` 决定模型列表（Agent 可设）；`editAction` 是语义标记，不影响模型查找（Agent 可设）；`toolsType` 覆盖 `subType` 的模型查找路径（Agent 永远不设）。例如 `subType: "image-image"` 查到的模型 ≠ `toolsType: "image-redraw"` 查到的模型，它们是完全不同的模型列表。

> **视频节点补充**：`duration` 允许按需显式写入，但只接受 `4s` ~ `15s` 的字符串格式；`aspectRatio` 如显式写入，只接受 `16:9` / `9:16` / `3:4` / `4:3` / `1:1`。两者不确定时省略，由客户端默认。

### 7.3 画布操作（工具调用优先 / `canvas-command` Fallback）

**优先使用工具调用**：`update_node_params(node_id, params)`（仅微调参数，不用于风格/内容变更）/ `run_node(node_id)` / `delete_node(node_id)` / `run_group(group_id)`。

> 🚫 风格/内容/主体变更 → 使用 `create_workflow` 新建 `image-image` 工作流，不要用 `update_node_params` 修改原节点的 content。

**Fallback**（工具调用不可用时）使用 `canvas-command` fence，每个 fence 只放一条命令对象：

- `update-param`：必须有 `nodeId` + `params`
- `run-node` / `delete-node`：必须有 `nodeId`
- `run-group`：必须有 `groupId`
- `relayout`：无额外必填字段

### 7.4 `form-fields` Canonical Schema

root 必须是**数组**，不是 `{title, fields}` wrapper：

```form-fields
[
  {
    "id": "style",
    "label": "画风",
    "type": "select",
    "options": [{"label":"写实电影","value":"realistic-film"}],
    "default": "realistic-film",
    "required": true
  }
]
```

字段 `type` 封闭集合：`text` / `textarea` / `select` / `multi-select` / `upload`。

不使用 `input`、`radio`、`checkbox` 等未登记类型；旧文档里的 `input` 一律按 `text` 改写。

## 九、内部结构化交接格式

除了前端可见的 7 种 fence，PlanF 还使用以下 `thinking` 内部结构化格式进行 Skill 间交接：

| 格式 | 产出者 | 消费者 | 说明 |
|------|--------|--------|------|
| `【Intent Brief】` | analyst | 总控/C 阶段 Skill | 固定字段+封闭枚举的意图分析结果 |
| `【Prompt Pack】` | prompter/video-prompt/reverse-engineer/story-ref-gen（显式 Seedance 兼容链路含 seedance-prompter） | engineer | 逐节点结构化提示词交接 |
| `【Prompt Blocker】` | C 阶段 Skill | 总控 | C 阶段阻断报告 |
| `【Delivery Validation】` | engineer | 自检 | 逐条 checklist 校验 |
| `【Engineering Blocker】` | engineer | 总控 | D 阶段阻断报告 |

这些格式在 `thinking` 块内，对用户不可见，但**格式固定、字段封闭**，确保 Skill 间交接的可靠性。

## 十、关键提醒

- 默认视频项目时，优先看 `VIDEO_PIPELINE.md`
- 视频主链的中间产物看 `skills/_shared/video-workflow-contract.md`
- 视频项目最终仍然要回到 `workflow-json`
- ⭐ 优先使用 `<tool_call>` 工具调用（`create_workflow`、`update_node_params`、`run_node` 等），fence 协议块作为 fallback
- 正式输出 **canonical schema**，不依赖客户端容错
- `update_node_params` **仅用于微调参数**（分辨率/比例等），要出新结果需跟 `run_node`。**风格/内容/主体变更不用 `update_node_params`**，改用 `create_workflow` 新建 `image-image`
- 简单请求首条回复直接交付（工具调用或协议块）
- C→D 是完整链，停在 C 不算完成
- 文档链期间只输出 `creative-doc`，不输出 `workflow-json` 或 `form-fields`
- 文档链中用户说"直接做" → 立即降级
- 图片说"图片"，视频说"视频主链"或"视频 workflow"
- 不复述 `modelCode` 或供应商名
- Seedance 节点的约束词/画质后缀/运镜关键词保留英文（已获语言豁免）
- **一轮回复最多一个主协议块**（workflow-json / canvas-command / form-fields / creative-doc 选一种）
- **不准输出上方 7 种 fence 以外的任何结构化标记**
- **不准输出禁用的 alias 字段**（见 7.2）
- **绝不在节点中写 `toolsType`**（见 7.2-B）——它会覆盖模型查找路径
