# Image Professional Delivery（图片专业交付与交互协议）

> 本文件定义图片领域的统一“专业交付链”。
> 适用于 `poster` / `brochure` / `ecom-image` / `brand-designer` / `brand-ip-designer` / `storyboard-master` / `social-carousel` / `cross-platform-adapter` / `ad-creative` / `youtube-thumbnail` / `rednote-cover` / `social-organic-surface` 等专业图片 Skill。
> 目标：既展示 Agent 的专业判断，又让用户有明确确认点，并保持结构化字段可被前端消费。

## 一、为什么需要本协议

专业图片任务不能只靠一句 prompt 直出。用户需要看到：

1. Agent 如何理解他的目标
2. 本次交付会包含哪些图 / 页面 / 方案
3. 标题、文案、风格、比例、语种、品牌元素如何处理
4. 哪些内容来自用户，哪些是 AI 代拟
5. 下一步是确认、修改，还是开始生成

所以专业图片任务必须在”出图”前提供结构化方案，除非用户明确说”不要方案，直接生成”。

## 二、统一链路

```text
Step 1: Professional Brief (form-fields 或从用户输入中抽取)
Step 2: Expert Diagnosis (专业诊断, 放入 creative-doc)
Step 3: Delivery Plan (结构化交付方案, creative-doc)
Step 4: CheckPoint (确认 / 换方向)
Step 5: Prompt Pack (用户确认后)
Step 6: Engineer -> workflow-json
Step 7: Follow-up Actions (终局 quick_actions)
```

## 三、何时必须先出 creative-doc

以下任一命中，必须先输出专业方案 `creative-doc`，不得直接进入 workflow:

- **多图套系**: 海报 4 方案、宣传册多页、电商主图集、详情页模块、品牌 VI、IP 系列、分镜板、社交轮播多卡
- **用户需要文案、标题、话术、风格、模块、页面结构、品牌策略等专业判断**
- **用户上传了关键资产**，需要说明保留 / 引用 / 届出方式
- **跨场景 / 扩边 / 多语种对图做不可逆修改**（如 `cross-platform-adapter`: 用户给一张源图，AI 决定每个目标比例的裁/扩/挪方法）
- **生成成本高，用户需要确认后再执行**
- **用户没有明确说”不要方案，直接生成”**

**强制 plan 的领域 Skill 清单**（这些 SKILL.md 在 `Output → Format` 中必须写”**必须** `creative-doc(type=…plan)`”，不允许号推荐）:

```text
`social-carousel` / `cross-platform-adapter` / `ad-creative` / `youtube-thumbnail` / `rednote-cover` / `social-organic-surface`
`poster` / `brochure` / `ecom-image` (套图/详情页) / `brand-designer` / `brand-ip-designer` / `storyboard-master` / `interior-design`
```

可跳过 `creative-doc` 的情况:

- 简单单图快速通道
- 用户 prompt 已高度完整且明确说”直接生成”
- 用户点击终局 quick_action 做一次轻量衍生

即使跳过 `creative-doc`，也必须在 `thinking` 中形成完整 Prompt Pack，不得偷懒。

## 四、统一 creative-doc 骨架

专业图片方案统一使用以下结构，具体字段由领域 Skill 扩展:

```json
creative-doc
{
  "type": "<<domain-plan-type>>",
  "title": "<<项目名> - 专业方案",
  "domain": "<<poster | brochure | ecom-image | brand-designer | brand-ip-designer | storyboard-master | social-carousel | cross-platform-adapter | ad-creative | youtube-thumbnail | rednote-cover | social-organic-surface>>",
  "phase": 1,
  "totalPhases": 2,
  "checkpoint": true,
  "checkpointPrompt": "方案已完成，下一步？A 确认开始生成 / B 修改文案 / C 调整风格方向 / D 调整交付数量 / 页面结构",
  "sections": [
    {
      "heading": "Brief 摘要",
      "layout": "key-value",
      "data": {
        "goal": "…",
        "targetUser": "…",
        "channelOrPlatform": "…",
        "styleDirection": "…",
        "language": "…",
        "assetRole": "…"
      }
    },
    {
      "heading": "专业诊断",
      "layout": "list",
      "data": [
        "本次视觉核心应优先突破…",
        "用户提供的信息中最关键的是…",
        "需要遵循的风险是…"
      ]
    },
    {
      "heading": "交付清单",
      "layout": "table",
      "data": [
        {"id": "D1", "交付项": "…", "作用": "…", "文案/内容": "…", "视觉策略": "…", "比例": "…", "资产引用": "…"}
      ]
    },
    {
      "heading": "下一步选择",
      "options": [
        {"id": "A", "label": "确认方案，开始生成"},
        {"id": "B", "label": "修改标题 / 文案"},
        {"id": "C", "label": "调整风格方向"},
        {"id": "D", "label": "调整交付数量 / 页面结构"}
      ]
    }
  ]
}
```

要求:

- `type` 必须是定值，不要靠时动态生成多个同义类型。
- `sections[].layout` 必须使用允许的布局： `key-value` / `table` / `list` / `text` / `highlight` / `storyboard` 等。
- 表格 `data` 必须是对象数组，列名稳定。
- 一轮最多一个 `creative-doc`。
- `creative-doc` 轮不同时输出 `workflow-json`。

## 五、领域 plan type

| Skill | plan type | 主要展示内容 |
|-------|-----------|-------------|
| `poster` | `poster-visual-plan` | 海报主题、核心信息、文案层级、4 方案差异、策迅比例、CTA |
| `brochure` | `brochure-page-plan` | 页数、页面结构、每页主题、文案层级、页间统一系统 |
| `ecom-image/detail` | `ecom-detail-page-plan` | 产品 Brief、主副标题、话术、关点文案、详情页模块 |
| `ecom-image/full-set` | `ecom-image-plan` | 8 图清单、描点模式、关目专项、平台适配 |
| `brand-designer` | `brand-visual-plan` | 品牌原型、隐喻矩阵、视觉规范、Logo/VI 方案 |
| `brand-ip-designer` | `brand-ip-plan` | VI 提取、IP 骨架、系列矩阵、三视图、材质工艺 |
| `storyboard-master` | `storyboard-visual-plan` | 镜次、比例、参考图分析、官格/镜头方案、构图连续性 |
| `social-carousel` | `social-carousel-plan` | 平台族、张数、每卡角色与文案骨架、封面优先描点、安全区 |
| `cross-platform-adapter` | `cross-platform-plan` | 源图分析、每目标比例/方法（裁切/扩边/重构）、安全区号 Prompt 增量 |
| `ad-creative` | `ad-creative-plan` | 投放渠道、版式与 CTA、净图/字层策略、合规与自检 |
| `youtube-thumbnail` | `youtube-thumbnail-plan` | 16:9 物文案、主体号安全边、缩略图可读性 |
| `rednote-cover` | `rednote-cover-plan` | 3:4 内容适配身份、版式选择、标题主旨、防水印策略、200px 缩略自检 |
| `social-organic-surface` | `social-organic-plan` | Feed/Story 气质、图内字数限案、配文直觉、禁言号九宫格策略 |

## 六、统一 Brief 字段池

领域 Skill 可以按需裁剪，但专业图片至少从以下字段中取关键项:

| 字段 | id | 适用 |
|------|-----|------|
| 项目目标 | `goal` | 全部 |
| 主体 / 产品 / 品牌 | `subject` / `productName` / `brandName` | 全部 |
| 投放渠道 / 平台 | `channel` / `platform` | 海报 / 电商 / 宣传册 |
| 语种 | `language` | 电商 / 海报 / 宣传册 / 品牌出海 |
| 主标题 | `mainTitle` | 海报 / 电商 / 宣传册 |
| 副标题 | `subTitle` | 海报 / 电商 / 宣传册 |
| 核心卖点 / 宣传点 | `sellingPoints` / `keyMessage` | 电商 / 海报 / 宣传册 |
| 目标人群 | `targetAudience` | 全部 |
| 风格方向 | `styleDirection` / `visualStyle` | 全部 |
| 品牌主色 | `mainColor` / `brandColors` | 品牌 / 电商 / 海报 / 宣传册 |
| 品牌资产 / Logo | `brandLogo` | 品牌 / 海报 / 宣传册 / 电商 |
| 页数 / 模块数 / 交付数量 | `pageCount` / `moduleCount` / `nodeCount` | 多图任务 |
| 参考图用途 | `assetRole` | 有图片输入时 |
| 禁用词 / 合规限制 | `complianceNotes` | 电商 / 海报 / 医疗美妆食品 |

## 七、领域交付清单规范

### 7.1 Poster

交付清单每行代表一个候选方案:

| 字段 | 说明 |
|------|------|
| `schemeId` | A / B / C / D |
| `核心信息` | 第一眼传达的主题 |
| `主标题` | 具体文案 |
| `次级信息` | 时间 / 活动机制 / 卖点 |
| `主视觉` | 产品 / 人物 / 大数字 / 场景 |
| `版式` | 上下分区 / 左右分栏 / 中心聚焦 |
| `色彩` | 主色 / 辅色 / 强调色 |
| `比例` | 9:16 / 3:4 / 16:9 等 |

### 7.2 Brochure

交付清单每行代表一页:

| 字段 | 说明 |
|------|------|
| `pageId` | P1 / P2 … |
| `页面` | 封面 / 内页 / 封底 |
| `页面目标` | 吸引 / 说明 / 证明 / 转化 |
| `主标题` | 本页主文案 |
| `核心内容` | 本页承载的信息 |
| `视觉策略` | 主图 / 信息图 / 产品展示 / 图文排版 |
| `统一元素` | 色彩 / 字体 / 页眉页脚 / Logo |

### 7.3 Brand Visual

交付清单每行代表一个品牌方案或物料:

| 字段 | 说明 |
|------|------|
| `schemeId` | A / B / C |
| `图形概念` | 标志如何构成 |
| `隐喻` | 为什么代表品牌 |
| `设计手法` | 几何 / 负空间 / 字标改造等 |
| `色彩策略` | 主辅色与理由 |
| `适用场景` | 内部判断，不直接写进 prompt |
| `后续物料` | VI / 周边 / 社媒等 |

### 7.4 Brand IP

交付清单每行代表角色或工艺资产:

| 字段 | 说明 |
|------|------|
| `assetId` | IP1 / IP2 / HIDDEN |
| `角色定位` | 基础款 / 隐藏款 / 系列角色 |
| `VI 继承` | 颜色 / 符号 / 配件 |
| `三视图重点` | 正面 / 侧面 / 背面 |
| `材质工艺` | PVC / ABS / 搪胶 / 透明件 |
| `拆件逻辑` | 头部 / 身体 / 配件 / 底座 |

### 7.5 Storyboard

交付清单每行代表一个格子或镜头:

| 字段 | 说明 |
|------|------|
| `shotId` | S1 / S2 … |
| `画面目的` | 建立场景 / 展示动作 / 情绪推进 |
| `主体方位` | 左 1/3 / 居中 / 右 1/3 |
| `景别` | 全景 / 中景 / 近景 / 特写 |
| `关键道具` | 必须出现的道具 |
| `连续性` | soft-continue / hard-cut |

## 八、交互选项规范

专业图片 `creative-doc` 的 options 必须让用户可以明确控制方向，常用选项:

- `A 确认方案，开始生成`
- `B 修改主标题 / 副标题 / 文案`
- `C 调整风格方向`
- `D 调整交付范围 / 页数 / 模块数`
- `E 上传 / 替换参考图`

终局 `quick_actions` 只用于生成后的衍生创作，例如:

- 换一套风格
- 基于第 2 张精修
- 改成英文版
- 增加一组尺寸适配
- 扩展为套图 / 画册 / 详情页

不得用 quick_actions 代替阶段确认。

## 九、文案来源标记

所有涉及标题、卖点、宣传文案、品牌说明的专业图片方案，必须标注文案来源:

| 值 | 含义 |
|---|------|
| `user-provided` | 用户原文提供，必须完整保留 |
| `ai-draft` | AI 根据 Brief 代拟，用户需确认 |
| `ai-polished` | 用户给粗稿，AI 润色 |
| `omitted` | 用户未提供，且不应编造 |

真实事实不能用 `ai-draft` 编造。缺少具体时间、价格、地址、资质、销量、认证等事实时，必须追问或省略。

## 十、自检

- [ ] 是否选择了正确的 `plan type`?
- [ ] 是否先展示专业诊断，而不是直接出图?
- [ ] 是否有明确交付清单，且每个交付项有作用和视觉策略?
- [ ] 是否给了用户可操作的确认 / 修改选项?
- [ ] 文案是否标注来源?
- [ ] 用户提供的事实是否未被改写或伪造?
- [ ] 有图片资产时是否声明资产角色和引用方式?
- [ ] 是否避免同轮 `creative-doc` + `workflow-json` 混出?
