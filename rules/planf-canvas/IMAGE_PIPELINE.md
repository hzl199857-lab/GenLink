# 图片主链规范

> 这是 GenLink 图片领域的主链规范。
> 采用业内通用的图片主链组织方式：先建立统一图片创作心智，再按子任务加载专项 Skill。运行时以 GenLink 画布为用户可见品牌，底层采用 RH / PlanF Canvas 兼容协议，所有生成都收束到 `prompter -> engineer -> workflow-json`。

## 一、定位

`IMAGE_PIPELINE.md` 是图片域的顶层编排规范，负责回答四件事：

1. 用户到底要哪类图片能力？
2. 上传图 / 画布节点在本轮里扮演什么角色？
3. 是否需要领域 Skill 先做专业判断？
4. 最终如何把视觉策略交给 `prompter` 和 `engineer`？

它不是外部图片生成 API 规范，也不是各专项 Skill 的字段级 schema。字段级契约仍以 `skills/_shared/handoff-brief.md`、`skills/_shared/prompter-core.md`、`skills/engineer/SKILL.md`、`canvas-capabilities.yaml` 为准。

专业交付与交互协议见 `skills/_shared/image-professional-delivery.md`。所有专业图片 Skill 都必须能输出结构化 Brief、专业方案、交付清单和用户确认选项。

## 二、图片创作基础原则

所有图片任务默认同时满足：

1. **意图准确**：用户明确提出的主体、风格、构图、文案、比例、参考图用途、保留项、禁止项必须完整进入最终 prompt。
2. **质量增强**：在不违背用户意图的前提下，主动提升构图、光影、色彩、材质、背景和完成度。
3. **专业代劳**：能推断就推断，能默认就默认；只在主体不明、用途影响版式、参考图用途不明或需求冲突时追问。
4. **结果导向**：prompt 写具体画面控制，不堆抽象词；抽象审美词必须翻译为可执行视觉描述。
5. **画布优先**：Agent 不调用外部图片生成 API，只创建 / 修改 GenLink 画布工作流节点。
6. **专业交付**：专业图片任务先展示诊断和交付方案，让用户确认文案、风格、模块、页面或方案数量，再进入生成。

通用审美和 prompt 质量护栏见 `skills/_shared/image-aesthetic.md`。

## 三、图片能力地图

| 能力层 | 典型需求 | 主链 |
|--------|---------|------|
| General Image | 普通文生图、图生图、局部编辑、风格参考、封面配图 | `prompter -> engineer` |
| Single Page Design | 海报、活动图、宣传单页、Banner、封面、开屏图 | `poster -> prompter -> engineer` |
| Multi Page Design | 宣传册、画册、菜单、产品手册、企业画册 | `brochure -> prompter -> engineer` |
| Ecommerce Image | 商品主图、白底图、卖点图、详情页图、A+ Content | `ecom-image -> prompter -> engineer` |
| Brand Visual | Logo、VI、品牌周边、品牌主视觉系统 | `brand-designer -> prompter -> engineer` |
| Brand IP / Toy | 潮玩 IP、盲盒系列、三视图、材质工艺、3D 资产 | `brand-ip-designer -> prompter -> engineer` |
| Storyboard / Visual Control | 分镜图、宫格分镜、光影校正、三视图、画面推演 | `storyboard-master -> prompter/video-prompt -> engineer` |
| Image Reverse | 图片反推、图像分析、prompt bridge | `reverse-engineer -> engineer` |

## 四、执行分档

### 4.1 Fast Image

适用：简单单图、用户意图清晰、无领域关键词、无高成本一致性要求。

流程：

```text
UserInput -> compressed Intent Brief -> inline Prompt Pack -> engineer -> workflow-json
```

规则：

- 不强制读取领域 Skill。
- 默认单数请求交付 1 个结果；用户要多方案时再多节点。
- 有任意图片输入且意图是保留 / 修改 / 参考已有图时，必须走 `image-image`，不能退化成 `text-image`。

### 4.2 Standard Image

适用：常规专业图，用户目标明确但需要视觉规划，例如海报、封面、产品氛围图。

流程：

```text
Intent Brief -> Asset Role -> Visual Plan(可内联) -> Prompt Pack -> engineer
```

规则：

- `Visual Plan` 可以只在 thinking 中内联，不必每次输出 `creative-doc`。
- 若命中 `poster` / `brochure` / `brand-designer` / `ecom-image` 等 firstRoundInquiry Skill，按 UI 标签直达协议先追问；信息齐全时默认输出专业方案 `creative-doc`，用户确认后再进入生成。
- prompt 必须继承 `Visual Plan` 的构图、信息层级、色彩和参考图角色，不得只写一句抽象描述。

### 4.3 Professional Image

适用：多图套系、品牌系统、宣传册、电商详情页、跨节点资产一致性强的任务。

流程：

```text
Domain Skill -> creative-doc 方案确认 -> Prompt Pack -> engineer -> Image QA
```

规则：

- 高成本或多图任务优先先出 `creative-doc` 方案确认。
- 一轮最多一个 `creative-doc`；用户确认后才进入 Prompt Pack。
- 多图任务必须声明统一比例、节点数量、差异化维度和一致性锚点。
- `creative-doc` 的 plan type、交付清单和选项遵循 `skills/_shared/image-professional-delivery.md`。
- 电商详情页必须先结构化收集或代拟产品卖点、主标题、副标题、语种、风格和模块顺序，再输出 `creative-doc(type=ecom-detail-page-plan)` 让用户确认。

### 4.4 Asset-Consistent Image

适用：用户上传产品 / 角色 / Logo / 已有画布节点，并要求多张图保持同一主体。

流程：

```text
Asset Role -> Anchor Plan -> Batch Plan -> Prompt Pack -> engineer
```

规则：

- 资产角色判定见 `skills/_shared/image-asset-role.md`。
- 有真实节点 ID 时，后续 `image-image` 必须用 `edges.source` 连接真实节点；不能用语义别名。
- 多图围绕同一主体时，必须声明 anchor 来源和扇出拓扑。

## 五、子任务路由原则

1. **电商静态图优先 `ecom-image`**：主图、白底、详情页、卖点图、A+ 都是静态图；"详情页视频 / 主图视频"走 `marketing-video`。其中详情页必须按 `skills/ecom-image/references/detail-page-sop.md` 做 Brief / 文案 / 模块确认。
2. **单页营销视觉优先 `poster`**：活动海报、节日海报、促销海报、开屏图、Banner、单页宣传图。
3. **多页连续物料优先 `brochure`**：宣传册、画册、菜单、产品手册、企业画册。
4. **长期品牌资产优先 `brand-designer`**：Logo、VI、品牌识别系统、品牌周边、品牌主视觉系统。
5. **潮玩 / IP 工业资产优先 `brand-ip-designer`**：盲盒系列、IP 三视图、材质工艺、3D 开模级设定。
6. **精确控镜优先 `storyboard-master`**：用户明确要分镜图、三视图、光影校正、画面推演或需要视频前的可见故事板。

冲突处理仍以 `skill-registry.yaml` 为准。

## 六、参考图 / 上传图规则

图片输入不等于永远"保留主体"。必须先判断角色：

- 创作主体
- 待编辑素材
- 风格参考
- 色彩参考
- 构图参考
- 内容参考
- 已有节点上下文

具体判断和 subType / edge 决策见 `skills/_shared/image-asset-role.md`。

底线：

- 用户说"在这张基础上改 / 给他戴帽子 / 换衣服 / 保持主体"时，必须 `image-image + editAction:redraw`。
- 用户只说"参考这个风格"时，不能强行保留主体。
- 同时要求"严格保留主体 + 大幅改变视角 / 姿态 / 构图"时，要提示冲突并让用户确认优先级。

## 七、多图规则

默认多图需要在方案和 prompt 层面有差异：

- 构图视角
- 光影方案
- 色彩基调
- 场景氛围
- 风格倾向
- 主体姿态 / 表现形式

但以下场景关闭强差异化，只允许细节级微调：

- 用户 prompt 已高度具体
- 存在明确参考图且要求保留主体 / 复现构图 / 沿用风格
- 领域 Skill 有一致性约束，如 `ecom-image` 产品主锚、品牌 VI 扇出物料

同批次默认同 ratio；ratio 不作为多样性手段。

## 八、Image QA

输出 Prompt Pack 或 workflow 前，按任务档位检查：

### 8.1 所有图片必查

- 用户明确要求是否完整保留？
- 抽象词是否已翻译为具体画面控制？
- 重点视觉维度是否被覆盖？
- 有图片输入时，subType 是否与资产角色一致？
- 多图是否同 ratio？
- 是否无 `toolsType` / 无外部生成 API / 无伪造节点 ID？

### 8.2 单页设计加查

见 `skills/_shared/image-single-page-layout.md`：

- 主题 3 秒内可识别
- 信息层级最多三层
- 文字七要素明确
- 禁止占位符和直角引号
- 并列信息已视觉化

### 8.3 资产一致性加查

见 `skills/_shared/asset-consistency.md` 和 `skills/_shared/image-asset-role.md`：

- 同一主体的锚点描述是否一致？
- `image-image` 是否有 edge？
- 跨轮引用是否使用真实 `node-…`？
- 多图是否声明 anchor / sourceNodeId / editAction？

## 九、与现有文件的分工

| 文件 | 职责 |
|------|------|
| `IMAGE_PIPELINE.md` | 图片主链、能力地图、分档、路由和 QA |
| `skills/_shared/image-aesthetic.md` | 通用图片画面质量心智 |
| `skills/_shared/image-asset-role.md` | 上传图 / 画布节点角色判定 |
| `skills/_shared/image-single-page-layout.md` | 海报 / 单页 / 封面文案版式规则 |
| `skills/_shared/image-professional-delivery.md` | 图片专业 Brief / creative-doc / 交付清单 / 交互选项 |
| `skills/_shared/prompter-core.md` | Prompt Pack 工程契约 |
| `skills/engineer/SKILL.md` | workflow-json / canvas-command 组装 |
| 领域 Skill | 只保留领域判断、追问、默认值、prompt delta、engineer delta 和专属自检 |

## 十、反例

- ❌ 简单插画也强制走多阶段 `creative-doc`，拖慢体验。
- ❌ 用户上传产品图做主图集，却让 8 张都独立 `text-image`。
- ❌ 海报 prompt 只写"高级、有设计感、信息清晰"，没有文案位置 / 字号 / 色彩 / 主视觉。
- ❌ 宣传册每页独立风格，缺统一色系和版式系统。
- ❌ Logo prompt 写"黑白可用、小尺寸清晰、适合包装"，没有翻译成块面、负形、线条、构图。
- ❌ 领域 Skill 直接输出 workflow-json，绕过 prompter / engineer 分工。
