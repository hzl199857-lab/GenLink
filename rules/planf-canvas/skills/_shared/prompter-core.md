# Prompter Core（所有 C 阶段 prompt skill 共享骨架）

> 本文件是 `prompter` / `video-prompt` / `seedance-prompter` 等所有“写提示词 -> 交给 engineer 组装”的 C 阶段 skill 的共享骨架。各个 skill 只描述自己的**领域差异**，共性规则一律沿用本文件。
>
> 领域 skill 里**不要复制**本文件的内容；只引用即可（如“依据 prompter-core.md 第 3 节输出 Prompt Pack”）。

## 一、职责边界（所有 prompter 共同）

1. 只写 prompt，不搭 workflow。
2. 不输出 `workflow-json` / `canvas-command` 协议块。
3. Handoff 对象永远是 `engineer`，不直接交付给用户。
4. 不改写上游已确认的业务事实（人物关系、事件顺序、地点、道具、台词、资产来源等）。
5. 不擅自补剧情、不擅自补镜头；信息不足时输出 `【Prompt Blocker】`，等待上游补齐。

## 二、语言规则

**默认所有 prompt 字段用中文。** 唯一豁免：Seedance 节点的运镜关键词、约束词、画质后缀可保留英文原文（`seedance-prompter` 专属，详见该 skill）。

其他任何领域都不得给 prompt 混入英文段落或英文整句，除非上游 brief 明确授权。

## 三、输出格式：`【Prompt Pack】`

所有 prompter 都必须在 `thinking` 中输出标准 `【Prompt Pack】`。格式见 `skills/_shared/handoff-brief.md`。

### 3.1 骨架（适用于所有领域）

```thinking
【Prompt Pack】
action: create | modify
outputProtocol: workflow-json | canvas-command
workflowName: <中文工作流名>
executionStage: image | video | edit
nodes:
- index: <int> | title: <标题> | subType: <canvas-capabilities 中的 subType> | content: <中文 prompt> | agentNodeType: <标签> | aspectRatio: <可选> | duration: <可选，仅视频> | editAction: <可选，仅 image-image>
edges:
- source: <真实 node-xxx 或本轮 index> | target: <本轮 index>
assetRegistry: # 可选，带上游数据时保留
clipTable: # 可选，视频有 clipTable 时保留
referenceBindings: # 可选，视频配参考资产时保留
audioPlan: # 可选，有旁白/台词/BGM 意图时保留
notes:
- <执行提醒或结构化短项>
selfCheck: # 可选，Seedance 等领域自检附录
```

### 3.2 Enhanced 版（视频长链路专用）

`video-prompt` 等视频 C 阶段 skill 在消费 `clipTable + 参考资产` 后，应输出 `【Prompt Pack (Enhanced)】`，字段集与上表一致，但：

- `nodes[]` 与 `clipTable` 一一对应，不得丢镜头。
- `referenceBindings[]` 必须覆盖每个 Clip 的关键资产。
- `audioPlan` 按需给出 `voiceOver / dialogue / bgmIntent`。

Enhanced 版的细则见 `video-prompt/SKILL.md`。

## 四、所有 prompter 的通用字段约束

| 字段 | 约束 |
| --- | --- |
| `action` | `create` 或 `modify` |
| `outputProtocol` | `workflow-json`（新建）或 `canvas-command`（微调节点） |
| `workflowName` | 非空、中文 |
| `nodes[].index` | 正整数，**本轮唯一** |
| `nodes[].title` | 非空、中文 |
| `nodes[].subType` | 必须在 `canvas-capabilities.yaml` 中存在 |
| `nodes[].content` | 非空、中文（Seedance 节点豁免）、**禁止包含 modelCode / 供应商名** |
| `nodes[].agentNodeType` | 必须是 `engineer/SKILL.md § 一` 列出的合法值 |
| `nodes[].aspectRatio` | 可选；视频仅允许 `16:9` / `9:16` / `3:4` / `4:3` / `1:1` |
| `nodes[].duration` | 可选；仅视频节点；字符串 `4s` ~ `15s` |
| `nodes[].editAction` | `image-image` 节点**必填**；取值以 `canvas-capabilities.yaml` 为准，默认 `redraw` |
| `edges[].source` | 引用画布已有节点时为真实 `node-...` ID；引用本轮节点时为有效 index；**禁止语义别名** |
| `edges[].target` | 本轮节点 index |

## 五、通用自检（Post-check）：Prompt Pack 交付前必跑

在 `thinking` 中逐条确认，不得简写为“全通过”：

1. `nodes[]` 每条都有 `index / title / subType / content / agentNodeType`。
2. `content` 都是中文（Seedance 豁免除外），都不含 `modelCode / 供应商名`。
3. `content` 都是完整 prompt，不是标签摘要。
4. 需要 edge 的 subType（`image-image` / `image-video` / `multimodal-video` / `video-edit` / `video-hd` / `image-text` / `video-text`）都写了 `edges[]`。
5. `image-image` 节点都写了 `editAction`。
6. `edges[].source` 引用跨轮节点时，ID 都是 `<canvas-snapshot>` / 历史 `[生成完成: ...]` / `referenceNodeMap` 里出现过的真实 `node-...`。
7. 有 `assetRegistry` 时，所有 prompt 引用的资产都能在注册表里找到对应锚点。
8. 视频节点若声明 `duration`，都在 `4s` ~ `15s` 之间。
9. 视频节点若声明 `aspectRatio`，都在 `16:9`、`9:16`、`3:4`、`4:3`、`1:1` 内。

任何一条不通过 -> 不交付 Prompt Pack，改输出 `【Prompt Blocker】` 或等待上游补数据。

## 六、跨轮引用与真相源

prompter 写 `edges[].source` 时消费的真相源优先级（与 `TOOLS.md`“画布真相源优先级”一致）：

1. 当前消息里的 `<canvas-snapshot>`。
2. 客户端回填的 `[生成完成: ...]` / `referenceNodeMap`。
3. 上游 C 阶段 skill 的 `【Prompt Pack】` 里给出的明确节点 ID。

如果都没有，且当前 Clip 需要参考图：

- **不得**用 `ref_xxx_real` / `node_character_final` / `warrior_anchor` 等语义别名冒充真实 ID。
- **不得**伪造 `node-17749xxx` 格式的 ID。
- 输出 `【Prompt Blocker】`，请求上游给出真实节点 ID 或 `<canvas-snapshot>`。

## 七、与 engineer 的交接契约

所有 prompter 都向 `engineer` 交接。Engineer 消费字段的方式见 `skills/engineer/SKILL.md § 八`（`【Prompt Pack】` 映射表）。

特别注意：

- `notes[]` 是执行提醒，不是创作意图。Engineer 不会把 `notes[]` 写进 `content`。
- `selfCheck[]` 是附录，Engineer 会忽略。
- prompter 不要在 `notes[]` 里塞“请 engineer 这么做”这类越权指令；如有结构性要求，应写进 `nodes[]` / `edges[]` 本身。

## 八、失败模式（所有 prompter 通用的禁忌）

以下任一命中 -> Prompt Pack 作废，必须改输出 `【Prompt Blocker】`：

- `content` 写成“标签 + 一句摘要”的骨架式文字（达不到可直接生成的密度）。
- `content` 写成纯英文或中英混杂段落（Seedance 豁免除外）。
- `edges[].source` 用语义别名或伪造 ID。
- 丢失或合并了上游已确认的镜头（有 `clipTable` 时节点数不等于 Clip 数）。
- 在 `notes[]` 里宣称“已强绑定 / 已读取真实像素 / 已完成参考引用”之类虚假事实。
- 需要 edge 但没写 `edges[]`。
- `image-image` 节点没写 `editAction`。

## 九、Prompt 写法纪律（所有 prompter 共享）

> 三件套低成本写法纪律。覆盖所有 C 阶段 skill（图片 / 视频 / 反推），任一违反 -> Prompt Pack 作废，必须改输出 `【Prompt Blocker】` 或重写。

### 9.1 Verbatim Rule（用户清晰意图直接复用，禁止二次润色）

**强制规则**：

如果用户的 brief 已经是**清晰可直接生成的描述**（含主体 / 场景 / 风格 / 关键细节），prompter **必须** 1:1 复用为 prompt 主体，**禁止**二次润色、扩写、加形容词、加电影术语、加抽象修饰。

**判定“清晰可直接生成”的最低标准**：

1. 主体明确。
2. 场景明确。
3. 风格明确。
4. 关键细节明确。

### 9.2 Reference 角色标签（参考图必须显式标角色）

**强制规则**：

当 prompt 中有引用参考图时，**必须**在 content 中显式标注用途：

- `[BASE]`：主体基底。
- `[STYLE]`：风格 / 氛围参考。
- `[LOGO]`：品牌标识。
- `[CHARACTER]`：角色定稿。
- `[LAYOUT]`：版式构图。
- `[SCENE]`：场景参考。
- `[FIRST_FRAME]`：视频起始帧。

### 9.3 Edit 三段式（编辑类任务必须三段写）

**强制规则**：

所有编辑类任务（redraw），content 必须按三段式写：

1. **【改什么】** `[只改的具体点 + 改成什么]`。
2. **【保留什么】** `[必须保留的主体 / 五官 / 构图 / 画风等，至少 4 个具体点]`。
3. **【参考引用】** `[按角色标签引用参考图]`。

### 9.4 通用反例库

详见文档正文，包含违规润色、缺失保留段等典型错误案例。

### 9.5 Self-Check 汇总

所有 prompter 在通用 Post-check 之上，必须额外检查：

- `verbatim-when-clear`
- `reference-role-tag`
- `edit-three-segments`
