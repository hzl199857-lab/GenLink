# GenLink Canvas Phase Policy

> 本文件定义 GenLink 智能体的阶段触发规则。这里的"执行"指 GenLink 画布工作流交付；底层采用 RH / PlanF Canvas 兼容协议。OpenClaw 负责承接结构化协议与前端状态，不代表另一套视频主链。

## 目标

`GenLink Canvas` 采用 **Adaptive Depth** 策略：

- 简单任务走快速道，直接 `C -> D` 交付 `workflow-json`
- 中等任务走标准道，允许一次高价值追问后交付
- 复杂创意任务走文档链道，通过多阶段文档逐步深化后交付
- 用户随时可以在任意阶段说"直接做"降级到快速道
- 默认视频项目可进入 `video-sop` 主链：九阶段方法论 + 强结构化中间产物 + 最终 workflow

## 阶段职责

| 阶段 | 作用 | 默认是否触发 |
|------|------|------------|
| `A` Analyze | 识别目标、媒介、素材角色、复杂度评分、路由建议 | 始终触发 |
| `B` Confirm | 补齐 blocker 或进行一次高价值确认 | 条件触发 |
| `S/W/T` Document Chain | 领域 Skill 驱动的多阶段文档深化 | 条件触发 |
| `C` Craft | 生成提示词、brief、反推文本 | 始终触发 |
| `D` Build | 组装 `workflow-json` / `canvas-command` | 始终触发 |

## 三条车道

### 快速道（score < 5）

路线：`A -> C -> D`

适用场景：

- 简单单体图片/视频请求
- 参数已够的基础生成请求
- 用户明确说"直接做""先出一版""不用问了"

#### ⚡ 快速道效率硬约束

快速道任务**必须在同一轮（同一条 Assistant 回复）内完成 A→C→D**。但默认视频项目若仍缺资产 / Clip / 关键确认，不得为了快而跳过门控。

| 要求 | 说明 |
|------|------|
| **零文件加载** | 不加载 analyst.md / prompter.md / engineer.md / phase-policy.md |
| **内联评分** | 用压缩版 `【Intent Brief (compressed)】` |
| **内联提示词** | 用 `【Prompt Pack】` 在 thinking 中完成，不拆轮 |
| **内联组装** | 用 `【Delivery Validation】` 在 thinking 中完成 |
| **禁止空输出** | 每轮 Assistant 回复必须有协议块 |
| **禁止 API 直调** | 绝不调用外部生成接口，只输出结构化协议 |

### 标准道（score 5~8）

路线：`A -> B -> C -> D`

### 文档链道（score >= 9）

路线：`A -> [Doc Chain: S -> W -> T] -> C -> D`

**漫剧/影视例外**：标准漫剧/影视请求默认走前置流水线（Round 1 角色定稿 → Round 2 分场规划），完成后再并入 `video-sop -> video-prompt -> engineer`。**但如果用户明确说"直接做"/"一键拿结果"，只允许折叠叙事决策：R2 scenePlan 可内联；画布执行仍必须 anchors first，不能在同一个 `create_workflow` 里同时创建角色定稿和视频节点。** 仅在用户显式要求"帮我详细策划剧情"等深度需求时，漫剧才进入文档链道。详见 `AGENTS.md`「漫剧/影视速查」。

## Video-SOP 主链例外

当任务命中默认视频项目时，阶段机优先切到 `video-sop` 主链：

| 阶段 | 默认产物 |
|------|---------|
| Phase 3 内容大纲 | `creative-doc(type=video-outline)` |
| Phase 4 剧本创作 | `creative-doc(type=video-script)` |
| Phase 5 素材挖掘 | `creative-doc(type=asset-registry)` |
| Phase 6 分镜设计 | `shot-list` / `shot-timing` / `clip-table` / `continuity-check` |
| Phase 7 参考素材生成 | `【Prompt Pack】 -> engineer -> workflow-json` |
| Phase 8 分镜生视频 | `【Prompt Pack (Enhanced)】 -> engineer -> workflow-json` |
| Phase 9 剪辑 / 配乐 | `workflow-json` 或 `creative-doc + workflow-json` |

额外规则：

1. `video-sop` 的关键阶段必须可见且可解构
2. 未形成等价的 `confirmedClipTable + referenceReady` 状态前不得进入 Phase 8
3. 采用视频主链不等于直接调用外部原生工具
4. 最终交付必须保持 `workflow-json`
5. 合法跳步只允许压缩 Phase 6 / 7 的显示过程，不允许缺失等价产物

## 复杂度分诊系统

### 四维评分

Analyst 在 Phase A 中计算以下四个维度的加权分数：

#### 维度 1：结果复杂度

| 信号 | 分值 |
|------|------|
| 单个资产（一张图/一段短视频） | 1 |
| 多资产但彼此独立（多张海报） | 2 |
| 多资产且需要统一风格 | 3 |
| 有叙事连贯性的序列（广告片/漫剧） | 5 |

#### 维度 2：策划深度需求

| 信号 | 分值 |
|------|------|
| 直接执行（"画一只猫"） | 0 |
| 轻度方向确认（"做个科技感 Logo"） | 2 |
| 需要结构化 brief（"做个产品广告片"） | 4 |
| 需要完整创意策划（"做个3分钟种草视频，适配小红书"） | 6 |

#### 维度 3：一致性约束

| 信号 | 分值 |
|------|------|
| 无一致性要求 | 0 |
| 风格统一 | 1 |
| 跨场景角色一致 | 3 |
| 角色+场景+道具全链路一致 | 5 |

#### 维度 4：用户信号

| 信号 | 分值 |
|------|------|
| 用户显式要求深度策划 | +10 |
| 用户显式要求快速执行 | -10 |
| 上传了产品图/品牌物料 | +2 |
| 提到了投放平台 | +1 |
| 提到了具体时长（>30s） | +2 |
| 提到了目标受众 | +2 |
| 提到了多场景/多角色 | +2 |

### 评分规则

- 四个维度分数相加
- 维度 4 的正向信号累计上限为 +7（防止过度膨胀）
- 用户显式信号（+10/-10）不受上限约束，直接覆盖路由
- 最终分数 < 5 → 快速道
- 最终分数 5~8 → 标准道
- 最终分数 >= 9 → 文档链道

### 领域特殊路由

| 领域 | 特殊规则 |
|------|---------|
| mangaDrama | 即使评分 >= 9，标准漫剧/影视请求仍默认走前置流水线：R1 角色定稿 → R2 分场规划（文字）→ 并入 `video-sop` 视频阶段。仅用户显式要求深度策划时触发文档链；若用户明确要求一键直出且信息足够，只折叠 scenePlan 等叙事决策，画布节点仍按 anchors first 分轮交付 |
| videoSop | 默认沿用视频九阶段门控；创意发散优先于参数表单；高成本阶段前必须完成结构化确认 |

## 文档链规则

### 文档链由谁驱动

文档链不是总控自己展开的，而是由**领域 Skill 的 Deep Mode 声明**驱动：

1. Analyst 算出 score >= 9
2. 总控查 `skill-registry.yaml`，找到匹配的领域 Skill
3. 检查该 Skill 是否声明了 `deepMode`
4. 如果声明了，按 `deepMode.documentChain` 的顺序逐个调用
5. 如果该 Skill 没有声明 `deepMode`，降级为标准道

### 文档链的通用约束

1. 每轮只产出一个 `creative-doc`
2. 每个 `creative-doc` 必须附带 checkpoint
3. 用户确认后继续下一个文档
4. 所有文档完成后，领域 Skill 输出增强版 handoff-brief，进入 C -> D
5. 文档链阶段不输出 `workflow-json`（互斥）
6. 文档链最多 4 个阶段（防止无限深化）

### 用户随时可以改变车道

| 用户行为 | 系统响应 |
|---------|---------|
| 系统判定文档链道，用户说"直接做"/"不用细想" | 立即降级到快速道，用已有信息生成首版 |
| 系统判定快速道，用户说"帮我详细策划" | 升级到文档链道 |
| 文档链中某阶段，用户说"你来定" | 跳过该阶段 checkpoint，Agent 拍板继续 |
| 文档链中某阶段，用户说"这块改一下xxx" | 修改该阶段文档后继续 |
| 文档链中途，用户说"后面的不用了，直接做" | 用已完成文档的信息作为 brief，跳入 C -> D |
| 漫剧流水线中用户说"直接做"/"一键拿结果" | 用当前已掌握的角色/场景信息折叠后续轮次，并入 `VIDEO_SOP -> CRAFT -> BUILD` |

### 文档链的降级逻辑

- 如果用户在第一个 checkpoint 就说"直接做" → 降级为标准道或快速道
- 如果用户在中间 checkpoint 说"直接做" → 用已完成文档生成 handoff-brief，进入 C -> D
- 如果没有匹配的领域 Skill 声明 Deep Mode → 自动降级为标准道

## 何时必须追问（Blocker）

只有出现以下 **blocker** 时，才必须进入 `B`（适用于所有车道）：

| blocker 类型 | 说明 | 例子 |
|-------------|------|------|
| 目标类型不明确 | 不知道用户到底要图片、视频、反推、编辑还是增量改 | "帮我弄一下这个" |
| 派生任务缺源素材 | 任务天然依赖图片或视频，但用户没有提供 | "让这张图动起来"但没有上传图 |
| 指令互相冲突 | 同一任务中存在无法同时满足的要求 | 同时要求横版主视觉和 9:16 竖版成片 |
| 领域锚点缺失 | 领域 Skill 最小业务锚点缺失，无法建立方案 | 营销视频没有品牌/产品，漫剧没有故事主题 |
| 现有节点目标不明确 | 用户要求修改有画布节点，但未提供可识别节点上下文 | "把刚才那个改一下"但没有节点上下文 |

## 什么不算 blocker

以下信息默认不要先问，优先用用户上下文、画布上下文、平台默认值或专业默认值补齐：

- 视频具体时长，但用户只是泛泛说"做个视频"
- 具体比例，但场景已有明显平台惯例
- 精确镜头数，只要先能交付单段或单组工作流
- 更细的风格修饰词，只要主体和核心目标明确
- 是否带音效，除非用户明确强调
- 生成分辨率，除非用户明确强调
- 已有图增量编辑里用户未被点名的背景、构图、镜头距离，默认保持原图一致

## 什么不算执行请求

以下输入默认不进入 `C -> D` 执行链，也不进入文档链：

- 纯问候：`你好`、`Hello`、`在吗`
- 纯寒暄：`早`、`晚上好`
- 纯确认在线：`有人吗`

这类消息应简短接话，并把话题拉回创作入口。

## 何时必须首轮直接交付

以下场景默认第一条有效回复就直接输出 `workflow-json`：

- 简单单体图片请求
- 简单单体视频请求
- 参数已经足够的基础生成请求
- 已有图单次增量编辑请求（如"给他戴帽子"且源图明确）
- 用户已经明确说"直接做""先出一版""不用问了"

额外硬约束：

- `C` 阶段不是终点，简单请求必须在同一轮继续进入 `D`
- 如果用户可见内容里还没有 `workflow-json` / `canvas-command`，就说明这轮没有完成
- 对简单直出请求，最终可见回复应直接从协议块开始
- 领域 brief 也不应外显；只要信息足够，本轮仍要继续收束成可执行协议块

## 单数请求默认值

当用户用单数表达时，默认只交付一个结果：

- "一个企鹅" → 1 个结果
- "一张海报" → 1 个结果
- "一个视频" → 1 个结果

只有在以下情况才扩展多方案：

- 用户明确说"来两版 / 几版 / 多方案"
- 任务天然要多节点结构
- 领域 brief 明确要求并列方案

## 自检清单

输出前快速确认：

1. 我现在追问，是因为真的缺信息，还是只是想问得更完整？
2. 如果不追问，我能不能先交付一个合理首版？
3. 这轮追问会不会让用户明显更省时间，而不是更累？
4. 当前任务的复杂度，是否真的需要文档链？
5. 用户有没有显式信号表明他想要快速还是深度？

只要第 2 个问题答案是"能"，通常就不该继续追问或展开文档链。

## 阶段状态机（v2）

### 状态定义

| 状态 | 含义 | 允许的转换 |
|------|------|-----------|
| IDLE | 等待用户输入 | → TRIAGE |
| TRIAGE | 隐式关键词匹配 + analyst 评分 | → FAST / STANDARD / DOC_CHAIN / MARKETING_VIDEO / ECOM_IMAGE / MANGA_PIPELINE / SEEDANCE / STORYBOARD / VIDEO_SOP / DOMAIN_ASSESS / GREET |
| GREET | 非执行请求（问候/寒暄） | → IDLE |
| FAST | 快速道：直接 C→D | → CRAFT |
| STANDARD | 标准道：需确认后 C→D | → CONFIRM → CRAFT |
| DOC_CHAIN | 文档链道：多阶段深化 | → DOC_STEP |
| MANGA_PIPELINE | 漫剧前置叙事流水线 | → MANGA_STEP0 / MANGA_ROUND / VIDEO_SOP |
| CRAFT | C 阶段：提示词 / 反推 | → BUILD |
| BUILD | D 阶段：协议块组装 | → DELIVER |
| DELIVER | 输出协议块 | → IDLE |

### 转换规则

| 转换 | 触发条件 | 说明 |
|------|---------|------|
| IDLE → TRIAGE | 收到用户消息 | 每条新消息都从 TRIAGE 开始 |
| TRIAGE → GREET | 消息为纯问候/寒暄 | 简短接话，不进入执行链 |
| TRIAGE → FAST | score < 5 且无 blocker | 直接进入 C→D |
| TRIAGE → STANDARD | score 5~8 或有高价值确认点 | 先确认再执行 |
| TRIAGE → DOC_CHAIN | score >= 9 且 deepMode.enabled | 展开文档链 |
| TRIAGE → MARKETING_VIDEO | 命中营销视频信号 | 进入营销专项链 |
| TRIAGE → ECOM_IMAGE | 命中电商主图信号 | 进入电商专项链 |
| TRIAGE → VIDEO_SOP | 命中默认视频项目 | 进入 video-sop 主链 |
| STORYBOARD → CRAFT | storyboard-master 方案完成 | 进入提示词生成 |
| VIDEO_SOP → CONFIRM | 当前阶段需要用户确认 | 停在当前阶段，等待继续 |
| VIDEO_SOP → DOC_STEP | 当前阶段产物是 creative-doc | 输出阶段文档并等待反馈 |
| VIDEO_SOP → CRAFT | 当前阶段需要生成 Pack | 进入参考素材或视频 prompt 阶段 |
| VIDEO_SOP → BUILD | 已有可组装 workflow | 交给 engineer |
| STANDARD → CONFIRM | 需要用户确认方向 | 输出 form-fields |
| CONFIRM → CRAFT | 用户确认 | 进入提示词生成 |
| DOC_CHAIN → DOC_STEP | 加载领域 Skill 的 deepMode | 按 documentChain 顺序展开 |
| DOC_STEP → CRAFT | 用户"直接做" / 文档完成 | 用已有信息进入 C→D |
| MANGA_PIPELINE → VIDEO_SOP | 用户要求一键直出 | 并入视频主链，anchors first |

> **MANGA_STEP0 说明**：Step 0 输出 `form-fields` 确认生产标准（画风/比例/时长）。如用户首条消息已明确这些参数，可直接跳过 MANGA_STEP0 进入 MANGA_ROUND(R1)。

> **MANGA_ROUND 内部子流程**：R1 内含 CRAFT → BUILD → DELIVER，用于输出角色定稿 `workflow-json`。R2（分场规划）默认输出 `creative-doc`（场景规划文字），不生成画布节点。R2 完成后默认入 `video-sop -> video-prompt -> engineer`；若用户明确要求一键直出，则把 R2 的 scenePlan 内联进同轮视频主链决策，不再单独等待确认。但视频节点必须引用已 finished 的真实角色定稿 nodeId；缺 anchor 时先创建 anchor 并停等下一轮。

### 每轮状态追踪

运行时状态头的唯一 canonical 格式见 `BOOTSTRAP.md § 0.A`。本文件只描述状态机语义，不再定义第二套状态头模板。

```thinking
【State】phase=<phase> | prevGate=<gate> | nextAction=<next> | skillLoaded=[...] | ruleChecks=PASS | videoTrack=<short|standard|long>-
```

配合规则：
1. 每轮 `thinking` 的第一个 `【...】` 块必须是 `【State】`。
2. `phase` 承载当前状态机位置，例如 `fast-track`、`video-sop/phase-6.3-shots-assembly`。
3. `skillLoaded` 只写本轮实际读过的文件或 Skill。

> 🚫 `【Intent Brief】` / 领域 Brief 里都**不要**带 `score=` / `dim1=` / `totalScore=` 这种评分中间产物（参见 `skills/analyst/SKILL.md § 3.4`）。只写**结论性**的 route / 关键判定理由。

### 状态机的降级与升级

| 用户行为 | 状态变化 |
|---------|---------|
| 系统判定 DOC_CHAIN，用户说"直接做" | DOC_CHAIN/DOC_STEP → CRAFT（降级） |
| 系统判定 FAST，用户说"帮我详细策划" | FAST → DOC_CHAIN（升级） |
| 文档链中用户说"你来定" | 跳过当前 DOC_STEP，进入下一个 |
| 文档链中用户说"后面不用了" | DOC_STEP → CRAFT（部分降级） |
| 漫剧中用户上传了新参考图 | 根据参考图状态重新判断 currentRound |
