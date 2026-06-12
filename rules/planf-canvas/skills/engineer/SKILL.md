---
name: engineer
description: <tool_call> 工具调用组装（fallback: workflow-json / canvas-command fence），交付链终点，支持多 Clip 编排。
metadata: {"openclaw":{"emoji":"⚙"}, "planF":{"phase":["D"]}}
user-invocable: false
---

# Skill: engineer

## Contract

### Input

- **Required**: action, outputProtocol, workflowName, nodes
- **Optional**: edges, assetRegistry, clipTable, referenceBindings, audioPlan, notes, selfCheck, engineerDeltas, existingNodeIds
- **Validation**:
- action 必须是 `create` / `modify` → reject
- outputProtocol 必须是 `workflow-json` / `canvas-command` → reject
- nodes 至少包含 1 个条目 → reject
- 每个 `nodes[].subType` 必须在 canvas-capabilities.yaml 中存在 → reject
- 非 `video-hd` 节点的 `nodes[].content` 不能为空 → reject
- 非 `video-hd` 节点的 content 默认必须是中文（Seedance 节点的约束词与画质后缀允许英文）→ reject
- 有 clipTable 时节点数必须与 Clip 数一致 → reject

### Output

- **Format**: 优先 `<tool_call>` 文本工具调用（`create_workflow` / `update_node_params` / `run_node`），fallback: fence 协议块（workflow-json 或 canvas-command）
- **Validation**:
- 未使用 canonical fence → reject
- 每个节点必须有 id/type/subType/title，且非 `video-hd` 节点必须有 content → reject
- 每个节点必须有 `from: "agent"` 和 `agentNodeType` → reject
- image-image 节点必须有 editAction → reject
- 跨轮次引用画布已有节点时，edge.source 必须是画布上真实节点 ID → reject
- 引用画布已有真实节点的派生编辑任务，必须同时带 `edge` 与 `sourceNodeId` → reject
- `create_workflow(autoRun=true)` 只表示"已发起运行"，不得在完成说明里把它写成"已经生成完成" → reject
- 禁止把 `ref_xxx_real` / `ref_xxx_fixed` / `node_character_final` 这类语义别名当成跨轮次真实节点 ID → reject
- 最终 `video_clip` 的 `edges.source` 禁止使用 `ref_1_xxx` / `char_female_ref` / `node_character_final` 等临时 ID；跨轮引用必须是真实 `node-...` 且有 finished / outputUrl 证据 → reject
- 最终 `video_clip` 若消费变体引用，`referenceBindings` 中必须能追溯 `variantOf` / `baseAssetId` / `reusableForClips`，否则 reject
- 若上游仍停留在 `shot-list` / `shot-timing`，而没有最终 `clipTable`，Engineer 必须阻断，不能自生成长视频 workflow → reject
- 若上游声明有 12 个 Shot / Clip，交付时不得静默漏成 10 个视频节点；少了任何一个都应阻断 → reject

### Concurrency

- safe: false
- handoff to: 无（终点）

## 🔴 语言规则

**`content` 默认写中文。** 唯一豁免：Seedance 节点的约束词、画质后缀和运镜关键词允许保留英文原文（模型对英文关键词响应更精准）。

## 一、Agent 标记字段（每个节点必填）

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `from` | string | 是 | 固定值 `"agent"`，标记该节点由 Agent 创建 |
| `agentNodeType` | string | 是 | 节点的功能角色标签，描述这个节点在工作流中扮演什么角色 |

| 值 | 含义 | 典型场景 |
| --- | --- | --- |
| `character` | 角色/角色设定图 | 漫剧 Round 1 角色参考图 |
| `non_human_character` | 非人角色（动物/异形/拟人化生物） | 漫剧/视频中的宠物、神兽、机器人主体定稿 |
| `prop` | 物品/道具 | 道具参考图 |
| `shot` | 分镜头 | 分镜板、故事板分镜（任何需要精确控镜时可用） |
| `first_frame` | 首帧 | 视频首帧图 |
| `scene` | 场景描述/策划 | 主题策划文本节点 |
| `copywriting` | 文案 | 文案/脚本文本节点 |
| `logo` | Logo | 品牌 Logo 生成 |
| `cover` | 封面 | 轮播图/社媒封面图 |
| `illustration` | 配图 | 普通图片生成 |
| `background` | 背景 | 背景图生成 |
| `reference` | 参考图 | 风格/构图参考 |
| `style_ref` | 风格参考 | 风格锚定参考图 |
| `output` | 最终输出 | 最终交付节点 |
| `prompt_bridge` | 提示词桥接 | image-text 桥接节点 |
| `storyboard` | 故事板 | 故事板/9宫格 |
| `video_clip` | 视频片段 | 视频生成节点 |
| `enhancer` | 增强/超分 | 视频/图片增强节点 |
| `campaign_shot` | 品牌战役画面 | 产品摄影/Editorial/海报实景嵌入/户外广告/包装/使用动作 |
| `interior_render` | 室内 3D 渲染 | interior-design render mode 主输出 |
| `floor_plan` | 室内彩平图 | interior-design floor-plan mode |
| `material_board` | 室内材质拼板 | interior-design material-board mode |
| `detail_shot` | 室内细部大样 | interior-design detail-shot mode |
| `body_part` | 身体部位特写定稿 | 手/脚/眼/耳多角度 + 肤色/骨骼/配饰锁定 |
| `transform_state` | 变形主体双态定稿 | initial state + final state 左右并列在同一节点 |

## 二、职责

依据 `canvas-capabilities.yaml` + 上游 brief，**优先通过 `<tool_call>` 调用 `create_workflow`** 创建工作流，或通过 `<tool_call>` 调用 `update_node_params` + `run_node` 修改已有节点。fallback 模式下输出 `workflow-json` 或 `canvas-command` fence 协议块。交付链终点，不改写上游 prompt 创作意图。

**🔴 Engineer 绝不调用外部图片/视频生成 API。** `image_generate`、`video_generate` 等工具调用 = 绕过画布 = 严重错误。画布节点的实际执行由客户端负责。

## 三、先判断输出模式

### ⭐ 首选：`<tool_call>` 文本工具调用

| 情况 | 工具 |
| --- | --- |
| 新建工作流 | `create_workflow(name, nodes, edges, autoRun)` |
| 修改已有节点参数 | `update_node_params(node_id, params)` + `run_node(node_id)` |
| 删除节点 | `delete_node(node_id)` |
| 运行编组 | `run_group(group_id)` |

| 情况 | 输出模式 |
| --- | --- |
| 新建工作流 | `workflow-json` |
| 修改已有节点 | `canvas-command`（update-param + run-node） |
| 删除/重跑 | `canvas-command` |

补充判断：

- 基于上传图或画布已有图，生成一个"改过的新版本" → `<tool_call>` 调用 `create_workflow`（或 fallback `workflow-json` fence）
- 只有明确是在"改已有生成节点的参数并重跑"，才用 `<tool_call>` 调用 `update_node_params` + `run_node`（或 fallback `canvas-command` fence）
- `create_workflow` 返回成功后，只能说明"工作流已创建 / 已启动"；若要继续引用其产物，必须等待生成完成反馈或真实节点快照

## 四、组装顺序

1. 确认 subType → 2. 节点数量与拓扑 → 3. 填充 content → 4. 视频专属字段 → 5. edges → 6. group → 7. autoRun

**视频专属字段使用原则**：`duration` 可以在视频节点中**按需显式写入**，用于表达 LLM 已经判断好的单段时长；格式固定为 `4s` ~ `15s`。`aspectRatio` 也可以像图片一样显式返回，但视频只允许 `16:9`、`9:16`、`3:4`、`4:3`、`1:1`。`resolution`、`videoWithAudio`、`modelCode` 仍不写入 `workflow-json` 节点，由客户端根据用户在画布上选择的模型和个人设置自动填充；若 `duration` / `aspectRatio` 不确定，则省略后交给客户端默认。

## 五、路由原则

**图片**：无图→text-image | 基于已有图→image-image
**视频**：无参考→text-video | 单图动态化→image-video | 多参考/连续成片→multimodal-video | 改写→video-edit | 增强→video-hd
**反推**：图片→image-text | 视频→video-text

补充规则：

- "给他戴帽子 / 换衣服 / 加道具 / 改发型 / 保持主体只改局部" 这类任务默认是 `image-image`
- 这类 `image-image` 默认 `editAction:redraw`
- 这类任务的 `content` 必须是增量编辑口径，不是从零生图口径

## 六、漫剧/影视流水线组装

**Round 1（角色定稿）**：text-image，aspectRatio: 16:9，无 edge
**视频主链阶段**：multimodal-video + 1 条入边（角色定稿），场景描述融入 prompt content，由 `video-sop / video-prompt` 产出视频 Prompt Pack。纯景/空镜头无需角色引用。

### 🔴 Self-Check `character-anchor-canonical-board`（事实层硬约束）

每个 `agentNodeType=character` 的节点 content 必须同时包含 3 个关键短语（缺一即 FAIL）：
1. **"纯白色背景"** 或 "白底" 或 "无背景"
2. **"三视图"** 或 "正面/侧面/背面" 或 "正视图/侧视图/后视图"
3. **"完整全身"** 或 "全身像" 或 "从头到脚"

推荐 canonical 完整短语：
`"角色设定参考图，保持人物一致性，多视图展示，纯白色背景，左侧：角色特大高清大头照...右侧：全身三视图..."`

## 六-B、分镜组装（任何任务可选）

当上游判断需要分镜时：

**分镜板**：image-image + editAction: redraw + edge 连参考图，宫格数由 storyboard-master 决定

**视频**：multimodal-video + 入边连分镜板（可选额外连参考图）

## 六-C、已有图增量编辑组装

当用户是在已有图基础上做单次改造时：

- 节点类型：`rh-image`
- `subType`：`image-image`
- `editAction`：默认 `redraw`
- 拓扑：1 条入边，`edge.source` 指向真实源节点 ID
- 冗余锚点：同时补 `sourceNodeId`，值与 `edge.source` 一致
- `content`：写"保留什么 + 只改什么"，未点名部分默认保持一致

## 七、输出格式

### 7.1 workflow-json 结构

```workflow-json
{
  "name": "工作流名称",
  "nodes": [...],
  "edges": [...],
  "autoRun": true
}
```

**节点只需写以下字段**（其余由客户端自动填充）：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | 临时唯一 ID，客户端创建后会替换为真实 ID |
| `type` | 是 | `rh-image` / `rh-video` / `rh-text` |
| `subType` | 是 | 见 canvas-capabilities.yaml |
| `title` | 是 | 节点标题 |
| `content` | 是 | 提示词（默认中文；Seedance 允许英文运镜/约束词/画质后缀） |
| `from` | 是 | 固定 `"agent"` |
| `agentNodeType` | 是 | 功能角色标签 |
| `aspectRatio` | 可选 | 比例，省略时用默认值；视频仅允许 `16:9` / `9:16` / `3:4` / `4:3` / `1:1` |
| `duration` | 可选 | 仅视频节点使用，字符串格式 `4s` ~ `15s`；省略时用客户端默认 |
| `sourceNodeId` | 条件 | 引用画布已有真实节点时建议必填，值与真实 source 节点 ID 一致 |
| `editAction` | 条件 | image-image 节点必填 |
| `_isSourceTextNode` | 条件 | 文本桥接源节点时设 `true` |

**不要写的字段**：`toolsType`、`modelCode`、`resolution`、`videoWithAudio`、`negativePrompt`、`seed`、`cameraMovement`、`motionScore`、`qualitySuffix`、`upscale`、`position`、`status`。这些由客户端根据用户选择的模型和设置自动填充。

> **🔴 `toolsType`**：禁写，详见 `validation.md §五`。

### 7.2 完整示例：简单图片

```workflow-json
{
  "name": "企鹅插画",
  "nodes": [
    {
      "id": "node_1",
      "type": "rh-image",
      "subType": "text-image",
      "from": "agent",
      "agentNodeType": "illustration",
      "title": "企鹅插画",
      "content": "一只可爱的企鹅站在南极冰川上，身穿红色围巾，背景是极光，二次元风格，高清细节",
      "aspectRatio": "1:1"
    }
  ],
  "edges": [],
  "autoRun": true
}
```

### 7.3 完整示例：简单视频

```workflow-json
{
  "name": "赛博少女视频",
  "nodes": [
    {
      "id": "node_1",
      "type": "rh-video",
      "subType": "text-video",
      "from": "agent",
      "agentNodeType": "video_clip",
      "title": "赛博少女",
      "content": "电影感，微距特写，一名留着发光青蓝色短发的赛博朋克少女，镜头从她的电子瞳孔缓慢拉远，展示她站在霓虹灯闪烁的雨中街道",
      "aspectRatio": "16:9",
      "duration": "10s"
    }
  ],
  "edges": [],
  "autoRun": true
}
```

### 7.4 完整示例：漫剧 Round 1（角色定稿）

```workflow-json
{
  "name": "角色定稿",
  "nodes": [
    {
      "id": "char_1",
      "type": "rh-image",
      "subType": "text-image",
      "from": "agent",
      "agentNodeType": "character",
      "title": "女主角-小雪",
      "content": "角色设定参考图，保持人物一致性，多视图展示，纯白色背景，左侧：角色特大高清大头照或半身近景肖像，突出五官、发型、年龄感与神态细节，右侧：全身三视图（正面、侧面、背面），自然 A 字站姿或标准站姿，完整展示体型比例、服装层次、鞋履与关键配饰，17岁日本少女，精致鹅蛋脸，大眼睛琥珀色瞳孔，黑色及肩中长直发带刘海，身高约158cm青春纤细体态，身穿白色水手服校服上衣，深蓝色百褶短裙，白色过膝袜，棕色乐福鞋，日系动漫画画风，清晰线稿，柔和赛璐璐上色",
      "aspectRatio": "16:9"
    },
    {
      "id": "char_2",
      "type": "rh-image",
      "subType": "text-image",
      "from": "agent",
      "agentNodeType": "character",
      "title": "男主角-小明",
      "content": "角色设定参考图，保持人物一致性，多视图展示，纯白色背景，左侧：角色特大高清大头照或半身近景肖像，突出五官、发型、年龄感与神态细节，右侧：全身三视图（正面、侧面、背面），自然 A 字站姿或标准站姿，完整展示体型比例、服装层次、鞋履与关键配饰，17岁日本少年，清秀面孔，棕色短发微翘刘海，身高约170cm阳光少年体态，身穿蓝色立领校服上衣，深蓝色长裤，白色运动鞋，日系动漫画画风，清晰线稿，柔和赛璐璐上色",
      "aspectRatio": "16:9"
    }
  ],
  "edges": [],
  "autoRun": true
}
```

### 7.5 完整示例：图生视频（带 edge）

```workflow-json
{
  "name": "图片动态化",
  "nodes": [
    {
      "id": "video_1",
      "type": "rh-video",
      "subType": "image-video",
      "from": "agent",
      "agentNodeType": "video_clip",
      "title": "动态化视频",
      "content": "镜头缓慢推近，花瓣随风飘落，光线渐变，整体氛围温馨自然",
      "aspectRatio": "16:9",
      "duration": "6s"
    }
  ],
  "edges": [
    {
      "id": "edge_1",
      "source": "node-17749abc123",
      "target": "video_1"
    }
  ],
  "autoRun": true
}
```

> **edge.source 说明**：引用画布上已有节点时，`source` 必须是真实节点 ID（格式如 `node-17749...`）。引用本轮创建的节点时，使用本轮定义的临时 ID。

### 7.6 完整示例：图生图增量编辑（带 edge + sourceNodeId）

```workflow-json
{
  "name": "角色加帽子",
  "nodes": [
    {
      "id": "img_edit_1",
      "type": "rh-image",
      "subType": "image-image",
      "from": "agent",
      "agentNodeType": "character",
      "title": "戴帽子的角色",
      "content": "基于参考图进行重绘，保留男孩的脸型、棕色短发走向、黑框眼镜、深色连帽背心、人物朝向、背景构图和手绘平涂漫画风格，仅给他戴上一顶深灰色毛线帽，帽子自然贴合头部，其余内容保持一致",
      "aspectRatio": "1:1",
      "sourceNodeId": "node-17749abc123",
      "editAction": "redraw"
    }
  ],
  "edges": [
    {
      "id": "edge_1",
      "source": "node-17749abc123",
      "target": "img_edit_1"
    }
  ],
  "autoRun": true
}
```

## 八、输入契约 —— 消费【Prompt Pack】

Engineer 从上游 C 阶段 Skill 的 `thinking` 中读取【Prompt Pack】，逐字段消费：

| Prompt Pack 字段 | Engineer 消费方式 |
| --- | --- |
| `action` | 决定输出 `workflow-json`（create）还是 `canvas-command`（modify） |
| `outputProtocol` | 交叉验证，与 action 一致 |
| `workflowName` | 直接作为 `workflow-json` 的 `name` |
| `executionStage` | 验证阶段约束（角色定稿→16:9，分镜板→image-image+redraw，分镜+视频链路允许合法共存） |
| `nodes[].index` | 生成对应的临时 `id`（如 `node_1`、`node_2`） |
| `nodes[].title` | 直接作为节点 `title` |
| `nodes[].subType` | 直接作为节点 `subType`，校验是否在 canvas-capabilities.yaml 中 |
| `nodes[].content` | 直接作为节点 `content`，不改写上游创作意图 |
| `nodes[].agentNodeType` | 直接作为节点 `agentNodeType` |
| `nodes[].aspectRatio` | 直接作为节点 `aspectRatio`，缺省用默认值补齐 |
| `nodes[].duration` | 视频节点按需写入 `duration`；若存在，原样下发校验为 `4s` ~ `15s` |
| `nodes[].editAction` | 直接作为节点 `editAction` |
| `edges[].source/target` | target 用 index 映射到临时 ID；source 为真实 ID 则保留，为 index 则映射 |
| `assetRegistry` | 一致性校验与命名参考，不直接写入协议块 |
| `clipTable` | 校验节点数、Clip 对应关系和 `duration` 是否一致 |
| `notes[]` | 执行提醒或结构化约束；如补 `sourceNodeId`，标记 `mode=text2video` |
| `selfCheck[]` | 上游 Skill 的自检规则；Engineer 忽略，不写入协议块 |

**如果上游没有输出【Prompt Pack】或【Prompt Pack (Enhanced)】，Engineer 不得自行发明节点内容。**

## 九、交付前质量门

Engineer 吐出协议块（`create_workflow` / `update_node_params` / `run_node` / `workflow-json` / `canvas-command`）**之前**必须跑：

1. **Self-Check**（`skills/_shared/self-check.md`）—— 通用规则，所有 skill 共享
2. **Delivery Validation**（`skills/engineer/validation.md`）—— engineer 专属结构校验，包含：
   - 【Delivery Validation】 checklist（9 组、每组打勾）
   - `F1–F17` Fail 条件表与对应阻断规则
   - 有限范围的自修复规则（最多 1 次）
   - 【Engineering Blocker】 阻断输出格式
   - `toolsType` 禁写详解

两道门的事实层检查都 PASS 才能向下输出协议块。Self-Check 事实层 FAIL → 走【Prompt Blocker】/【Engineering Blocker】阻断；质量层 WARN 按档位策略处理。Delivery Validation FAIL → 走【Engineering Blocker】。

## 十、约束

1. **⭐ 优先使用 `<tool_call>` 工具调用**（`create_workflow`、`update_node_params` + `run_node`），fence 协议块作为 fallback
2. 不改写上游 prompt 创作意图
3. 不发明新 subType 或 editAction
4. 不在 content 里写 modelCode
5. 简单无 blocker 时首条回复直接交付（工具调用或协议块）
6. `create_workflow` 后的下一步入口必须明确：终局衍生创作用 `quick_actions`；视频/营销阶段门控用 checkpoint/流水线确认按钮，禁止把阶段确认塞进 `quick_actions` —— 详见下方 § 十.A

## 十.A、`create_workflow` 后的用户入口（quick_actions / 阶段门控）

### 强制规则

本轮发了 `create_workflow` 工具调用后，必须判断交付类型：

- **终局交付 / 非门控衍生创作** → 可在同一轮回复尾追加 `quick_actions` 工具调用。
- **视频/营销/文档链阶段门控** → **不要**调用 `quick_actions`；改用 `creative-doc.checkpoint/options` 或前端流水线确认按钮，让用户显式选择下一步。

### 3 个 actions 的内容要求

- ✅ **必须是"基于当前结果做后续新创作"**（如 `换风格 / 换主体 / 加配乐 / 做衍生视频 / 出封面 / 加海报`）
- ❌ **禁止"修改当前节点"**（如 `重新生成 / 调整这张 / 改一下颜色`）—— 这类用 `update_node_params` 处理，不应该出现在 quick_actions 里
- ❌ **禁止"阶段确认 / 高成本推进"**（如 `素材 OK，一键生成全片视频`、`确认 Prompt，一键生成全片视频`、`进入视频生成`、`继续下一步`）。这些必须走 checkpoint/options 或流水线确认按钮。

## 十一、🔴 Prompt 不得压缩铁律（视频主链 Red Line 21）

1. **1:1 拷贝**：每个视频节点的 `content` 字段**必须**是上游 Clip Table / Phase 6.3 `description` 字段的**完整文本**或 `video-prompt` Skill 产出的 Prompt Pack 的**完整 prompt**。字数级别相同，不得做"摘要 / 概括 / 去重 / 省略细节"处理
2. **保留所有要素**：5 要素（景别 / 机位 / 距离 / 角度 / 运镜）、环境 / 光影 / 色调 / 主体动作 / 表情 / 台词 / 音效提示、转场意图——**任一要素不得被删**
3. **长度对照校验**（`prompt-no-compression` Self-Check 规则）：
   - 如果 Clip Table 里 `description` 是 120 字，workflow 节点 `content` 也必须 ≥ 100 字（允许 20% 格式化差异）
   - 如果压缩到 < 上游的 50%，必定 FAIL
4. **禁止的缩水模式**：
   - ❌ 把 `镜头：全景… 晚樱… 在林间疾驰…` **压成** `电影感大远景，航拍俯冲，翠竹翻腾，少女疾驰`
   - ❌ 多镜头共享同一段 prompt
   - ❌ 以"后面节点 prompt 差不多，直接复用前面"为由省略细节
5. **token 真的不够的唯一合法做法**：用【Engineering Blocker】reason=workflow-prompt-exceeds-token-budget 阻断，请用户确认拆分 project 或降档，不得吐"缩水版"workflow

### 自检

Engineer 组装 video workflow 前：
- [ ] 比对每个节点 `content` 长度 vs 上游 Clip `description` 长度；每个节点都达到 ≥ 80% 长度
- [ ] `prompt-no-compression` Self-Check 规则跑过并 PASS
- [ ] workflow-json 内节点数 = Clip Table 条数（`shot-count-equals-clip-count`）






