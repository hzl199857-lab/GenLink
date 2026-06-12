# Self-Check 协议 (每轮产出协议块前必做)

> 输出任何主协议块 (`workflow-json` / `canvas-command` / `form-fields` / `creative-doc`) 之前, Agent 必须在 `thinking` 里跑一遍 Self-Check, 逐条打勾并显式输出结果。事实层规则必须全部 PASS 才能向下输出协议块; 质量层问题使用 `WARN`, 按档位策略处理。

## 为什么需要它

- 强模型完全有能力**在输出之前**发现"我快要违反 phase-gating 了"、"我这个 option.id 太长了"——但没有一个固定位置让它停下来做这件事, 就直接吐出违规内容。
- 前端有 `AgentViolationBanner` 兜底, 但那是**最后一道防线**。让 Agent 自己先扫描一遍, badcase 能在客户端之前就消灭 80%。
- 同时这份清单本身也是**规则的真相源**: 以后新加约束只改这里。

## Canonical 格式

跟在 `【State】` 后面, 在任何协议块 (`workflow-json` / `creative-doc` 等) **之前**输出。

### 🔴 强制完整输出原则 (所有档位强制)

> **修复 badcase #4**: Agent 在 fast-track 路径下只输出"核心规则前 8 条"PASS, 跳过事实层硬约束清单的其他 8 条 (character-anchor-canonical-board / scene-coverage-complete / scene-per-clip-explicit / phase-7-before-phase-8 / quick-actions-after-create-workflow 等)。结果一轮 create_workflow 把 character + 2 个 video_clip 同轮塞进去, character 节点 content 不是带场景背景的英雄海报而不是三视图标准卡。**根因是 Self-Check 输出不完整 → 关键规则没被检查到**。

**Self-Check 块必须包含**:

1. **核心规则清单全部 12 条** (无论 skillLoaded 加载哪些):
- phase-gating / option-id-length / no-generation-claims / no-ghost-node-ids
- asset-one-to-one / protocol-fence-closed-set / skeleton-in-thinking-fence / single-main-protocol
- meta-block-in-thinking-fence / prompt-no-compression / video-at-protocol / video-at-blacklist

2. **事实层约束清单全部相关条目** (按本轮场景判断是否适用, **适用必跑**):
- 含 `create_workflow` → quick-actions-after-create-workflow / **subType-in-whitelist** / **editAction-in-whitelist**
- 含 character 节点 → character-anchor-canonical-board / node-type-matches-agent-type
- 含 video_clip 节点 → phase-7-before-phase-8 / scene-per-clip-explicit / no-character-with-video-in-same-workflow / video-at-protocol / video-at-blacklist
- 含 scene 资产 → scene-coverage-complete / style-not-cover-all-scenes / scene-asset-coverage
- **含 assetRegistry → two-occurrence-anchor-mandatory / reference-sheet-template-mismatch**
- **含 body-part 资产 → body-part-anchor-mandatory**
- **含 transforming-subject 资产 → transforming-subject-dual-state**
- **室内设计场景 → drt-branch-explicit / sot-decision-explicit-in-plan / ...**
- **任何输出 plan / creative-doc 的轮次 → creative-doc-fence-protocol**
- **任何收到推进信号的轮次 → cross-mode-pre-approval-respect + agent-no-empty-progress-reply**

3. **领域附加规则** (按 phase 字段判断, 详见 § 领域附加规则)

🔴 **禁止只输出"核心 8 条"就视为完成 Self-Check**——事实层硬约束清单中本轮场景适用的每一条都必须显式列出 PASS/FAIL。

## 核心规则清单 (**本轮检查的所有规则, 全部必填**)

| 规则 ID | 说明 | FAIL 的补救动作 |
|---|---|---|
| `phase-gating` 🔴 **事实层硬约束** | 本轮是否只输出 1 个 `creative-doc` fence? `document-chain-protocol.md` § 二.A. **所有档位强制**。FAIL 立即阻断输出, 禁止"FAIL 提醒不阻断"绕过 | 删掉多余的 creative-doc, 仅保留当前 phase; 如果用户说"继续"被理解成"折叠多阶段", 必须改为只推进 1 个阶段 |
| `option-id-length` | 所有 `option.id` 是否都 ≤ 2 字符 (A/B/C 或 1/2/3)? | 改写为短标签, 真实语义放 `label` / `desc` |
| `no-generation-claims` | 回复正文是否避免了"已画好 / 已生成 / 已完成 / 已渲染"等虚假成品声明? **已发生 BadCase 反例**: 「工作流已成功启动, **正在为你渲染**...」**正确写法**: 「已为你创建...已放到画布。生成需要约 1 分钟」 | 改写为"已创建 / 已放到画布上 / 工作流已准备好 / 节点已加入画布" |
| `no-ghost-node-ids` | 引用的节点 ID 是否都是 snapshot 里出现过的真实 `node-...`? | 换成真实 ID; 或先 `<tool_call>` 读 canvas 后再输出 |
| `asset-one-to-one` | 如果本轮涉及资产 / Clip 生成, 节点数是否与 `clipTable` / `assetRegistry` 一一对应? | 补齐漏掉的资产; 或显式说明"故意省略 X 个, 理由 Y" |
| `protocol-fence-closed-set` | 所有 fence 是否都在 7 个合法集合内? (`workflow-json` / `canvas-command` / `form-fields` / `creative-doc` / `agent-persona` / `thinking` / `progress`) | 把非法 fence 改回合法类型 |
| `skeleton-no-markdown` | 骨架字段 (`layout` / `scene` / `setting` / `heading` / `option.id` / 表头 / 状态枚举) 是否都是纯值、没写 Markdown? | 去掉骨架字段里的 `**` / `#` / `` ` `` |
| `single-main-protocol` | 本轮是否只有一种主协议块 (workflow-json / canvas-command / form-fields / creative-doc 四选一)? | 移除多余协议; 同轮只能一种 |
| `meta-block-in-thinking-fence` 🔴 **事实层硬约束** | 所有 `【State】` / `【Self-Check】` / ... 领域 Brief 块是否都在 ` ```thinking ` fence 内? 详见 `BOOTSTRAP.md` § 0.A.0 | 把 meta 块挪进 `thinking` fence |
| `self-check-not-leaked-to-user` 🔴 **事实层硬约束** | Self-Check 整块**真正包在 ` ```thinking ` fence 内**, 且**首行必须是 `【Self-Check】` 标头**。**自识别迹象**: 出现 `#核心规则` 等标题写法; 内容无 `【Self-Check】` 头; 前或后无围栏。**任一命中 = 你正在裸露 meta block** | 重写本轮: ① 用 ` ```thinking ` 开围栏; ② 第一行写 `【Self-Check】`; ③ 用 `//` 注释代替 `#` 做分隔 |
| `prompt-no-compression` | 进入 Phase 8 / workflow-json 输出时, 视频 / 图片 prompt 是否 1:1 拷贝自 Clip Table / Prompt Pack, 而非压缩/总结? | 恢复完整 prompt; 禁止以"省 token"为由缩水 |
| `video-at-protocol` | **任何** `rh-video` 节点只要挂了入边, content 必须用 `@图片N` / `@视频N` / `@音频N` 半角索引引用每个参考资产至少 1 次 | 改写 content: 把每个参考的角色 / 场景 / 道具加上 `@图片N` 索引 |
| `video-at-blacklist` | **任何** `rh-video` 节点 content 中**没有**以下任一非协议 `@` 写法: `@资产名`、`@(node-xxx)`、`【图片N】` 、全角变体; 用户主动施压也**不放水** | 把所有违规 @ 改回 `@图片N` |
| `quick-actions-after-create-workflow` 🔴 **事实层硬约束** | 本轮如发了 `create_workflow` 调用 → 必须提供清晰入口。终局/非门控 `quick_actions`; 门控轮走 checkpoint/options, 禁止把阶段确认塞进建议 | 终局交付补 3 个建议; 阶段门控轮移除 `quick_actions` |
| `node-type-matches-agent-type` 🔴 **事实层硬约束** | 节点的 `type` 字段必须与 `agentNodeType` 匹配。映射: `character/.../storyboard/shot/...` → `type=rh-image`; `video_clip/enhancer` → `type=rh-video`; `copywriting/prompt_bridge` → `type=rh-text` | 修正 `type` 字段; 所有 `agentNodeType=character` 节点必须 `type: "rh-image"` |
| `subType-in-whitelist` 🔴 **事实层硬约束** | 节点的 `subType` 必须在 `canvas-capabilities.yaml` 锁定的白名单内。**典型串台 BadCase**: 把语义标签 (`interior_render` / `body_part` / `video_clip` 等) 误写到 `subType` 字段。**白名单外取值 100% 是字段串台错误** | 改回白名单内合法值: 语义标签放 `agentNodeType` 字段, 绝不串入 `subType` |
| `editAction-in-whitelist` 🔴 **事实层硬约束** | `editAction` 只允许在 `subType=image-image` 时填写, 且取值必须在封闭集合内 (redraw/erase/expand 等)。`subType=text-image` / 视频 / 文本节点上**禁止**出现 | 把 editAction 改回白名单值; 非 image-image 节点删除该字段 |
| `no-character-with-video-in-same-workflow` 🔴 **事实层硬约束** | 同一个 `create_workflow` 调用的 `nodes` 中**禁止**同时含 `character` 节点和 `video_clip` 节点。防止引用未 finished 的临时 ID (badcase #4 现场) | 强制分两轮交付, 先 character 一轮 → 等 finished → 再 video_clip 一轮 |
| `storyboard-intent-gate` 🔴 **事实层硬约束** | 用户显式说 `故事板 / 视觉故事板 / 先看分镜 / 先看画面`, 或中途纠偏时, 必须暂停到视觉故事板生成/确认入口; 不得继续进入后续 Phase | 已有 Clip Table → 调 `storyboard-master`; 没有 → 先补齐 Clip 并保留 `storyboardIntent=visual` |

## 领域附加规则 (命中时才检查)

根据当前 State 的 `phase` 字段, 按需叠加:

### video-sop 相关

| 规则 ID | 适用 phase | 说明 |
|---|---|---|
| `clip-table-before-workflow` | `video-sop/phase-6` 及之后 | 进入 video workflow 之前必须已有 confirmed `clipTable` |
| `shot-count-equals-clip-count` | `video-sop/phase-8` | workflow 节点数必须等于 clipTable 条数, 不得静默丢弃 |
| `reference-ready-has-evidence` | `video-sop/phase-7` | 声称 reference 就绪必须有真实 `outputUrl` + `status=finished` |
| `prop-supplement-list-explicit` | `video-sop/phase-6.4-scene-reflection` | 必须输出独立 `propSupplementList` 子表 (即便为 `empty` 也要显式声明) |

### 参考素材生成 (story-ref-gen / phase-7)

| 规则 ID | 适用 phase | 说明 | FAIL 补救 |
|---|---|---|---|
| `style-baseline-locked` | `video-sop/phase-7-ref-gen` | 本轮为 step-0 或上游已有 finished 风格图节点 | 回 step-0 生风格图并等用户确认 |
| `subject-batch-before-variant` | `video-sop/phase-7-ref-gen` | step-2 必须有 finished 的 step-1 主体节点; 同轮不得混搭 | 拆轮: 先 step-1, 全部 finished 后再 step-2 |
| `solo-prompt-isolation` | `video-sop/phase-7-ref-gen` | 角色 prompt 无道具/场景/其他角色; 物品 prompt 无角色/手持; 场景 prompt 无角色 | 重写 prompt 仅保留单体本身 |
| `three-view-canonical-phrase` | `video-sop/phase-7-ref-gen` | 所有 user_ref_image / to_generate 角色主体 prompt 含完整三视图标准话术 | 补齐固定话术 |
| `scene-context-with-weather` | `video-sop/phase-7-ref-gen` 与 `phase-8` | 所有场景节点 / Clip content 含「地点 + 时间 + 内/外 + 外景天气」 | 补齐场景信息 |
| `style-edge-bound` | `video-sop/phase-7-ref-gen` | step-1 / step-2 节点 edges 含风格图节点 | 补 edge 指向风格图节点 |
| `no-group-reference-image` | `video-sop/phase-7-ref-gen` | 不存在"群体合并"参考节点 ("两人合照"家庭三口") | 拆为多个单体角色资产 |
| **`two-occurrence-anchor-mandatory`** | `video-sop/phase-3.A` `phase-7-ref-gen` | **所有 occurrenceCount ≥ 2 的资产都必须有真实 finished anchor 节点 + 正确 reference 模板** | 同轮调对应 storyboard-master 模块补 anchor |
| **`body-part-anchor-mandatory`** | `video-sop/phase-3.A` `phase-7-ref-gen` | **同一身体部位在 ≥ 2 镜头特写出场必须有 body-part-sheet anchor** | 调 storyboard-master/body-part-sheet 补 anchor |
| **`transforming-subject-dual-state`** | `video-sop/phase-3.A` `phase-7-ref-gen` | **变形/变身主体必须有双态 anchor** | 调 storyboard-master/transforming-subject 补双态 anchor |
| **`reference-sheet-template-mismatch`** | `video-sop/phase-3.A` `phase-7-ref-gen` | **anchor 节点使用的 reference 模板必须与资产 kind 严格匹配** | 重做 anchor, 使用正确模板 |

### 室内设计专项 (interior-design)

| 规则 ID | 适用 phase | 说明 | FAIL 补救 |
|---|---|---|---|
| **`drt-branch-explicit`** | `interior-design/step-0` | thinking 必须显式声明触发的 DRT 分支编号 (B1-B7) + 一句判定理由 | 重写 thinking 段加 drtBranch |
| **`sot-decision-explicit-in-plan`** | `interior-design/step-3-plan` | `interior-design-plan` 必须含「SOT 决策说明」段落 | 重写 plan 加完整 SOT 决策说明 |
| **`sot-derivation-explicit-in-prompt`** | `interior-design/derived-modes` | 所有衍生节点的 content 必须开头含完整【SOT 派生】标注 | 重写衍生节点 prompt 加【SOT 派生】开头 |
| **`sot-user-approval-required`** | `interior-design/cross-mode-offer` | Cross-mode Offer 启动必须满足双门禁: SOT finished + 用户文本明确批准 | 等用户文本批准; 禁止默默连跑衍生 |
| **`mao-pi-render-first`** | `interior-design/b4-branch` | B4 毛坯分支必须先走 Mode A render「装修好」生成 SOT | 回退到 Mode A render 先生成装修方案 SOT |
| **`interior-design-skill-loaded`** | `interior-design/all` | 命中室内设计关键词 → Agent 必须按 `interior-design` SKILL 走 | 重写本轮: 先输出 agent-persona 卡片 |
| **`interior-design-no-chat-tri-question`** | `interior-design/inquiry` | 本 SKILL 任何追问场景必须用 form-fields 或 creative-doc 协议; 禁止纯文本三问 | 重写本轮: 改写为 JSON 协议 |

### 视频 Prompt (video-prompt / phase-8)

| 规则 ID | 适用 phase | 说明 | FAIL 补救 |
|---|---|---|---|
| `voice-profile-mandatory` | `video-sop/phase-8` | 所有 audioPlan 涉及的台词都在 content 中以 `角色说: "台词" 音色: 性别/年龄/音调/语速/质感` 完整格式出现 | 为每条台词补完整音色描述 |
| `no-group-merge-pronoun` | `video-sop/phase-8` | content 中无 `他/她/这个人/那个人/对方/两人/三人/几人/夫妻/情侣` 等代词或群体合并词 | 全部替换为具体角色名 |
| `prompt-tail-directives` | `video-sop/phase-8` | 每个 Clip content 末尾按 video-prompt § 六 表格组合补齐: 语言 / 字幕禁令或要求 / BGM 禁令 / 配音尾音 | 每个 Clip 末尾补全局指令 |

### 时长算术门禁 (`long` / `standard` 档强制)

> 全部公式定义见 `skills/_shared/timing-rules.md`。Phase 4/6 每次交付前必须跑对应规则, 偏差 > 10% = FAIL。

| 规则 ID | 适用 phase | 说明 | FAIL 补救 |
|---|---|---|---|
| `script-duration-arithmetic` | `video-sop/phase-4-script` | Σ(场景预估时长) ≈ targetDuration ± 10% | 调整场景字数 / 数量 / 动作密度 |
| `script-word-budget` | `video-sop/phase-4-script` | 总字数落在 `timing-rules.md § 六` 的预算 ± 30% (5min ≈ 2000-2500 字) | 扩写或瘦身到预算内 |
| `scene-count-minimum` | `video-sop/phase-4-script` | `long` 档场景数 ≥ `ceil(targetDuration / 40)` | 拆分过粗场景 |
| `no-partial-delivery` | `video-sop/phase-6.1-script-chunk` | Clip Table / shot-list 必须一次性覆盖**全部场景**; 严禁"先给第一幕、后续补全"分批交付 | 一次性交付完整表格 |
| `clip-count-minimum` | `video-sop/phase-6.3-shots-assembly` | Clip 数 ≥ `ceil(targetDuration / 15)` | 回 6.1 拆细 |
| `no-hardcoded-clip-duration` | `video-sop/phase-8` | workflow 节点时长必须从 `clip-table` 读取真实值, 禁止写死 5s / 10s | 替换为 clipTable.duration |

### engineer 相关

| 规则 ID | 适用 phase | 说明 |
|---|---|---|
| `every-node-has-from-and-type` | `engineer/*` | 每个 workflow 节点必须有 `from: "agent"` + `agentNodeType` |
| `no-tools-type-on-agent-nodes` | `engineer/*` | Agent 节点严禁设置 `toolsType` 字段 |
| `canvas-command-action-whitelist` | `engineer/*` 且本轮输出 `canvas-command` | action 必须在封闭集合内 |

## 硬规则

1. Self-Check 必须在每个"会产生主协议块"的轮次输出。纯寒暄回复可以省略。
2. 任何事实层 `FAIL` 的情况下, **本轮不得输出主协议块** (workflow-json / creative-doc / canvas-command / form-fields)。必须改写直到 PASS, 或给用户一个阻断说明 (`【Prompt Blocker】` / `【Engineering Blocker】`)。
3. 质量层问题写 `WARN`: `long` 档必须自修复到 PASS; `standard` / `short` 档可按下方档位矩阵继续输出。`【State】` 头部的 `ruleChecks` 只记录事实层结果: 事实层全 PASS 时写 `PASS`, 事实层 FAIL 时写 `FAIL:<第一条失败规则>`。
4. 不允许"跳过 Self-Check"或只写 `ok` / `no issues` 这种空壳。每条规则必须独立输出 PASS / WARN / FAIL。
5. **模型变强后的根本原则**: Self-Check 不是装饰, 是 Agent 自律的基础设施。我们信任模型能做好, 但要求它**显式证明**自己做好了。

## 🌟 档位差异化执行策略 (**所有 FAIL 处理必须先按档位分流**)

> **核心原则**: 规则严格度按 `videoTrack` 档位差异化。long 档保留全部强约束 (影视级护城河), standard / short 档大幅减压让创作流畅。判定 `videoTrack` 见 `BOOTSTRAP.md § 0.A.2`。

### 档位差异化矩阵

| 档位 | Self-Check 执行 | FAIL 处理策略 | 适用场景 |
|---|---|---|---|
| **`long`** | **完整执行**全部 Self-Check 规则 | **Level 1 强制闭环**: FAIL 必须同轮自修复, 重写后再跑二次 Self-Check 全 PASS 才能输出 | 完整影视项目、漫剧多集、长视频带 BGM/字幕等高质量需求 |
| **`standard`** | 事实层全跑 + 核心质量规则执行 (约 50%) | **质量层 WARN 提醒不阻断**: WARN 在 thinking 里写 `【Self-Notice】` 提示用户"已知问题", **仍可输出主协议块** | 标准营销 / 中等长度叙事 / 多 Clip 普通项目 |
| **`short`** | 事实层全跑 + 底线质量规则执行 (约 20%) | **质量层 WARN 仅自记**: WARN 在 thinking 里写 `【Self-Notice】` 但**不阻断输出**, 且**不展示给用户** | 单图 / 单 Clip / 快速试稿 / fast-track 路径 |

### 各档位的输出形态差异

| 档位 | thinking 块内容 | 用户可见输出 |
|---|---|---|
| **`long`** | `【Self-Check】` 全清单 + 必要时 `【Self-Repair】` + `【Self-Check】` (二次) | 全 PASS 后的最终可用版 |
| **`standard`** | 事实层 PASS + 核心质量 `【Self-Check】` + (若有 WARN) `【Self-Notice】` 提示 | 含已知问题的草稿版 |
| **`short`** | 事实层 PASS + 底线质量 `【Self-Check】` + (若有 WARN) `【Self-Notice】` 仅自记 | 直接输出, 不暴露任何 WARN |

### `【Self-Notice】` canonical 格式 (standard / short 档专用)

```thinking
【Self-Check】
- core-rule-A: PASS
- quality-rule-B: WARN (got=X, expected=Y)

【Self-Notice】qualityLevel=draft | knownIssues=[quality-rule-B]
- quality-rule-B: WARN 原因=简短说明; 用户可说"修一下 X"触发精修轮次
- 当前档位=standard, 按策略不阻断输出; 如需 long 档级别质量请明确说"完整影视级"
```

### 🔴 事实层硬约束清单 (**所有档位强制 FAIL 阻断**)

不是所有 Self-Check 都能按档位放宽。以下规则属于**事实层错误**, **任何档位**包括 short / standard 都必须 PASS, FAIL 立即阻断输出:

| 规则 ID | 为什么必须事实层强制 | 来源 |
|---|---|---|
| `phase-gating` | 一轮多 creative-doc = 前端解析错乱 | `document-chain-protocol.md` |
| `protocol-fence-closed-set` | 自创 fence = 前端不解析 = 输出失效 | `AGENTS.md` 红线 #12 |
| `option-id-length` | option.id 超长 = 前端 UI 渲染崩 | `TOOLS.md § 7.4` |
| `no-ghost-node-ids` | 用语义别名 = edge.source 引用失败 = 工作流断 | `TOOLS.md` 真相源优先级 |
| `single-main-protocol` | 一轮多主协议 = 前端只渲染第 1 个, 其他全丢 | `AGENTS.md` 协议互斥 |
| `meta-block-in-thinking-fence` | meta 块裸露 = 用户看到内部 State 块 = 体验灾难 | `BOOTSTRAP.md § 0.A.0` |
| `video-at-protocol` / `video-at-blacklist` | @ 协议错 = 前端 0 解析 + 模型当噪声 | `AGENTS.md` 红线 #23 / #24 |
| `scene-coverage-complete` / `style-not-cover-all-scenes` / `scene-per-clip-explicit` / `scene-asset-coverage` | 场景资产缺失 = 画面连锁错 | `ref-extract` / `video-prompt` |
| `phase-7-before-phase-8` | Phase 7 anchor 未 finished 就出视频 = 引用空节点 | `VIDEO_PIPELINE.md § 7.3` |
| `character-anchor-canonical-board` | 角色锚点不是三视图标准卡 = 角色漂移 | `engineer/SKILL.md` |
| `every-node-has-from-and-type` | 节点缺 from / agentNodeType = 无法智能连线 | `AGENTS.md` 红线 #11 |
| `no-tools-type-on-agent-nodes` | 节点写 toolsType = 选错模型 | `AGENTS.md` 红线 #14 |
| `quick-actions-after-create-workflow` | 没有清晰下一步入口 = 用户被错误引导 | `TOOLS.md` / `BOOTSTRAP.md` |
| `node-type-matches-agent-type` | type 与 agentNodeType 不匹配 = 引用错乱 | `engineer/SKILL.md` |
| `no-character-with-video-in-same-workflow` | 同轮创建角色+视频 = anchor 还没 finished | `engineer/SKILL.md` |
| `storyboard-intent-gate` | 用户要分镜却强行生视频 = 吞掉用户意图 | `BOOTSTRAP.md` |

**判定原则**: 上述规则 FAIL → **任何档位**都不允许输出主协议块; 禁止用"FAIL 提醒不阻断"或 `【Self-Notice】` 绕过。

### 升档规则

用户主动说以下任一关键词, 自动升档为 long:
- "影视级 / 电影级 / 院线级 / 高品质"
- "长视频 / 完整故事 / 完整剧情 / 多集"
- "带 BGM / 带字幕 / 完整成片"
- "无瑕疵 / 不要有问题"

升档后立即按 long 档全规则跑 Self-Check。

### 降档规则

用户主动说以下任一关键词, 自动降档 (standard → short):
- "快一点 / 简单点 / 直接做"
- "试个稿 / 看看效果 / 草稿 / 占位"
- "不用太精细 / 大概意思就行"

降档不需要回头补漏, 直接按 short 档底线规则推进。

## 🔴 FAIL 后的自律闭环 (**仅 long 档强制启用 Level 1**)

### 核心原则: **Agent 自己是 QA, 不是用户**——但分档执行

任何 Self-Check FAIL 都**必须由 Agent 这一侧闭环**, 绝不把违规结果吐给用户。但闭环强度按档位分流:

- **long 档** → 走下方 Level 1 强制闭环
- **standard 档** → 质量层 WARN 在 thinking 写 `【Self-Notice】` 不阻断; 事实层 FAIL 仍阻断
- **short 档** → 质量层 WARN 仅自记; 事实层 FAIL 仍阻断

### Level 1 (仅 long 档主力): 同轮 thinking 内自修复

Agent 在 long 档发现任一 Self-Check `FAIL` 或 `WARN` → **立刻**在同一轮的 thinking 里重写违规部分、重跑 Self-Check。**用户看不到半成品, 只看到最终可用版本**。

**自修复协议 (canonical)** ——FAIL 一次后必须输出 `【Self-Repair】`:

```thinking
【Self-Check】
- clip-count-minimum: FAIL

【Self-Repair】round=1 | failedRules=[clip-count-minimum]
diagnosis: 目标 300s 需 ≥20 Clip, 上一版只给 3。
fix: 按装箱算法重跑, 产出 22 个 Clip。

【Self-Check】(二次)
- clip-count-minimum: PASS
```

### Level 2 (fallback): Agent 主动阻断, 给建设性二选一

仅当 Level 1 自修复后仍 FAIL, 才转 Level 2:

- 本轮**不**输出主协议块
- 输出 `【Engineering Blocker】` 或 `【Prompt Blocker】`, 包含 `blockedRule`、`reason`、及 **2-3 个建设性二选一**选项。

**Level 2 不是"失败告知"**, 是"把决策权交还给用户的岔路口", 文案必须正向。

### Level 3 (debug-only): 前端扫描仅作开发者自查

`AgentViolationBanner` 现在**只在 debug 模式**下显示, 普通用户端**完全隐藏**。

- 用途: 开发者 / QA 调试 badcase 时快速定位 Agent 具体违反了哪条
- **不是**面向用户的"一键纠正"
- **不是**让用户当 Agent 的 QA——Agent 自己就是 QA

### 设计哲学对比

| 错误思路 | 正确思路 (本工程遵循) |
|---|---|
| Agent 吐了半成品 → 用户看到警告 → 用户点按钮救回 | Agent 自己是 QA → FAIL 立即自修复 → 用户只看到最终版 |
| 把违规曝光给用户, 让用户学习内部规则名 | 用户不关心规则名, 只关心拿到能用的结果 |
| 用户端 UI 里有"一键纠正"按钮 | 用户端永远看不到违规; 开发者自查 debug Banner |
| FAIL 时向下吐 + 加 warning 标签 | FAIL 时直接重写, 重写完才吐 |
