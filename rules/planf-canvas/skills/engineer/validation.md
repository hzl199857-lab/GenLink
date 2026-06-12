# Engineer Delivery Validation (交付前质量门)

> Engineer 组装完协议块后、向用户交付之前**必须**跑的一道显式校验。凡是 `create_workflow` / `update_node_params` / `run_node` / `workflow-json` / `canvas-command` 输出，走这里。

> 跟 `skills/_shared/self-check.md` 的差别：self-check 是所有 skill 共同遵守的轻量规则清单；本文件是 engineer 在"快速吐出 workflow-json"时的重墨细节校验。两者**并列**，不是替代。

## 一、Delivery Validation Checklist

在 `thinking` 块中显式打勾，逐条输出：

```thinking
【Delivery Validation】
1. JSON 合法性:
✓ JSON.parse 通过
✓ 无尾逗号
✓ 所有 key 带引号
2. workflow-json 结构:
✓ root 是对象 {name, nodes, edges, autoRun}
✓ name 非空
3. 节点校验 (逐节点):
✓ node_1: id/type/subType/from/agentNodeType/title/content 齐全
✓ node_1.from = "agent"
✓ node_1.subType 在 canvas-capabilities.yaml 中存在
✓ node_1.content 为中文 (Seedance 豁免项除外)
[如果是 image-image] ✓ node_1.editAction 存在
[如果是 角色定稿] ✓ node_1.aspectRatio = "16:9"
[如果是视频且写了 aspectRatio] ✓ node_1.aspectRatio ∈ {16:9, 9:16, 3:4, 4:3, 1:1}
[如果是视频且写了 duration] ✓ node_1.duration 为 `4s`~`15s` 的字符串
4. Edge 校验:
✓ 需要 edge 的 subType (image-image/image-video/multimodal-video/video-edit/video-hd/image-text/video-text) 都有至少 1 条入边
✓ edge.source 引用画布已有节点时为真实 ID (node-xxx 格式)
✓ edge.source 引用本轮新建节点时为有效临时 ID
5. Canonical 校验:
✓ 无 alias 字段 (prompt/description/text/sub_type/subtype/aspect_ratio/edit_action)
✓ 无 data/params wrapper
✓ 使用 canonical fence 类型
6. 阶段规则:
✓ anchors first: 同一 workflow 中不得同时创建角色定稿节点与 video_clip 节点；一键直出只允许折叠 scenePlan，视频必须引用已 finished 的真实 anchor nodeId
✓ 分镜→视频链路同样遵守 anchors first: 视频节点只能引用已 finished 的分镜板或其他合法上游锚点，不得同轮创建分镜板又让视频节点引用其临时 ID
✓ 角色定稿 content 包含"保持人物一致性+左侧大头照+右侧三视图+体态比例+纯白底"结构信号, 且显式声明了左右布局
✓ 冷启动一键模式下, 不会用普通人物肖像冒充角色板
7. 禁写字段:
✓ 无 toolsType (🔴 最高优先级检查——toolsType 会覆盖模型查找, 导致选错模型)
✓ 无 modelCode/resolution/videoWithAudio/negativePrompt/seed
8. 一致性 (有 clipTable 时):
✓ 视频节点数 === clipTable.length (不允许静默丢镜头)
✓ 每个 clipTable 条目都有对应节点
✓ 每个节点 duration / aspectRatio 与 clipTable 行一致
9. 真материал源 (引用跨轮节点时):
✓ 所有跨轮 edge.source / sourceNodeId 都能在 <canvas-snapshot> 或历史 [生成完成] / referenceNodeMap 中查到
✓ 没有使用 ref_xxx_real / node_character_final 这类语义别名充当真实 ID
结论: PASS → 交付
```

每一条 ✓ 都必须真实打过, 不允许只写"全通过"。

## 二、Fail 条件 (任一触发即阻断)

| # | Fail 条件 | 严重级别 |
|---|---|---|
| F1 | JSON 不能 `JSON.parse` | 阻断 |
| F2 | root 不是完整对象 `{name, nodes, edges, autoRun}` | 阻断 |
| F3 | 任一节点缺必填字段 (id/type/subType/from/agentNodeType/title) | 阻断 |
| F4 | 非 `video-hd` 节点缺少 `content` | 阻断 |
| F5 | 任一节点缺 `from: "agent"` | 阻断 |
| F6 | 任一节点缺 `agentNodeType` | 阻断 |
| F7 | `image-image` 节点缺 `editAction` | 阻断 |
| F8 | 需要入边的节点缺少入边 | 阻断 |
| F9 | edge.source 引用画布已有节点但非真实 ID 格式 | 阻断 |
| F10 | 使用了 alias 字段或 data/params wrapper | 阻断 |
| F11 | 包含禁写字段 (modelCode 等) | 阻断 |
| F12 | **包含 `toolsType` 字段** (任何节点出现 `toolsType` 都是严重错误——它会覆盖 `subType` 的模型查找路径, 导致节点使用错误的模型列表。图片编辑用 `editAction`, 视频高清用 `subType: "video-hd"`) | 阻断 |
| F13 | 视频节点 `duration` 存在但不在 `4s` ~ `15s` 之间 | 阻断 |
| F14 | 视频节点 `aspectRatio` 存在但不在 `{16:9, 9:16, 3:4, 4:3, 1:1}` 中 | 阻断 |
| F15 | 有 `clipTable` 但视频节点数 ≠ `clipTable.length` (静默丢镜头) | 阻断 |
| F16 | 跨轮 edge.source / sourceNodeId 引用了语义别名 (`ref_xxx_real` / `node_character_final` 等) | 阻断 |
| F17 | 上游仍停留在 `shot-list` / `shot-timing`, 无最终 `clipTable`, 却尝试下发长视频 workflow | 阻断 |

## 三、自修复规则 (仅限机械漏填)

| 错误类型 | 修复方式 |
|---|---|
| content 为英文 | 翻译为中文 (Seedance 节点除外: 约束词与画质后缀保留英文) |
| aspectRatio 缺失 | 按媒介类型补齐 (image→1:1, video→16:9, 角色设定图→16:9) |
| `from` 缺失 | 补 `"agent"` |
| `agentNodeType` 缺失 | 根据节点用途补上对应值 |
| `image-image` 缺 `editAction` | 补 `redraw` |
| 已有图派生编辑缺 `sourceNodeId` | 用真实 source 节点 ID 补齐 |

**不允许的"修复"**:

- 不得通过改 `subType` 规避缺 edge (如把 `image-image` 降级成 `text-image`)
- 不得猜测、伪造或复用无依据的 edge
- 不得改写上游 prompt 创作意图
- 不得把 `toolsType` "修复"为其他值——**直接删除**。`toolsType` 出现在 workflow-json 中就是错误, 正确做法是确认 `subType` 和 `editAction` 已正确设置后删除 `toolsType`
- 不得把"漏掉的镜头"当作自修复项补全: 少镜头 (F15) 是上游协议破碎, 必须走 Blocker

自修复最多尝试 1 次。仍失败 → 输出 `【Engineering Blocker】`。

## 四、`【Engineering Blocker】` — 阻断时的标准输出

如果 `【Delivery Validation】` 发现无法在不改变业务语义的前提下修好的问题, **禁止输出协议块**, 改为:

```thinking
【Engineering Blocker】
issues:
- [具体问题1, 如 "node_2: multimodal-video 缺少 edge, 上游 Prompt Pack 未提供 source"]
- [具体问题2]
requiredFix:
- [需要谁做什么, 如 "需要确认角色定稿节点的真实 ID"]
failedChecks: [F8, F9]
```

总控收到 `【Engineering Blocker】` 后决定: 回退给用户追问、回退给上游 Skill 补充、或降级处理。

### Blocker 与 Self-Check 的关系

- `Self-Check` (`skills/_shared/self-check.md`) 会先跑一遍通用规则; 如果那里就 FAIL, Engineer 甚至都到不了 validation 这一步, 直接按 self-check 的阻断走。
- `Delivery Validation` (本文件) 是 engineer 交付前的最后一道, 专门处理 workflow-json / canvas-command 的结构细节。
- 两者的 blocker 都会让本轮**不输出协议块**; 区别是 Self-Check 层用 `【Prompt Blocker】` 或普通拒答, Engineer 层用 `【Engineering Blocker】`。

## 五、🔴 `toolsType` 特别说明 (F12 详解)

`toolsType` 是用户手动操作编辑工具 (局部重绘、智能擦除、画质增强等) 时由**客户端**设置的字段, 它会**覆盖 `subType` 的模型查找路径**, 导致节点使用完全不同的模型列表。

Agent 在任何场景下都不应写 `toolsType`:

- 图片编辑 → 用 `editAction` (语义标记, 不影响模型查找)
- 视频高清放大 → 用 `subType: "video-hd"` (正确的模型路由方式)

这条是 Engineer 自检清单里的**最高优先级项**, 任何包含 `toolsType` 的 workflow-json 都直接 F12 阻断。
