# Ecom Detail Page SOP（电商详情页标准流程）

> 本文件是 `ecom-image/SKILL.md` 的详情页专项规范。
> 目标：把“详情页图”从简单 5 图拆分，升级为**结构化商品 Brief → 转化策略 → 页面模块 → 文案版式 → 视觉锚点 → 分模块出图**的专业流程。

## 一、定位

详情页不是几张卖点图的集合，而是一个静态转化页面。它必须同时回答：

1. 卖什么？
2. 谁会买？
3. 为什么现在要买？
4. 用户最关心的卖点和顾虑是什么？
5. 用什么语言和风格表达？
6. 每个页面模块承担什么说服功能？

`[skill:ecom-image/detail]` 命中时，必须使用本 SOP；不得只按“卖点图 ×3 + 细节图 + 场景图”机械出图。

## 二、标准流程

```text
Step 1: Detail Brief 收集（form-fields）
Step 2: 商品 / 卖点 / 文案诊断
Step 3: 详情页模块规划（creative-doc: ecom-detail-page-plan）
Step 4: 用户确认模块与文案
Step 5: 视觉锚点确认（user-upload 或 white-bg-first）
Step 6: 分模块 Prompt Pack
Step 7: engineer 装 workflow-json
```

---

## 三、Detail Brief 字段

### 3.1 必填字段

| 字段 | id | 说明 |
|------|----|----|
| 产品/品牌名 | `productName` | 不知道叫什么则 blocker |
| 产品图 | `productAsset` | 强烈建议上传；上传后详情页产品图统一走 `image-image` |
| 类目 | `category` | 决定场景、卖点、模特、细节专项 |
| 投放平台 | `platform` | 决定比例、文案密度、风格和合规 |
| 语种 | `language` | 中文 / 英文 / 中英双语 / 其他 |
| 核心卖点 | `sellingPoints` | 1-5 条；用户没有就让 AI 提炼 |
| 文案模式 | `copyMode` | 使用用户文案 / AI 起草 / AI 润色 |
| 风格方向 | `styleDirection` | 高端极简 / 科技感 / 温馨生活 / 强促销 / 亚马逊 A+ 等 |

### 3.2 高价值可选字段

| 字段 | id | 说明 |
|------|----|----|
| 主标题 | `mainTitle` | 详情页首屏 KV 的第一视觉文案 |
| 副标题 | `subTitle` | 对主标题补充利益点 |
| 目标人群 | `targetAudience` | 用于场景与文案语气 |
| 使用场景 | `useScenarios` | 如居家、差旅、通勤、办公、户外 |
| 品牌主色 | `mainColor` | 可含色值 |
| Logo / 品牌资产 | `brandLogo` | 用于页面统一-品牌识别 |
| 参数 / 规格 | `specifications` | 尺寸、容量、材质、功率、型号等 |
| 合规限制 / 禁用词 | `complianceNotes` | 医疗、美妆、保健品、儿童用品尤其重要 |

### 3.3 AI 可代劳字段

以下信息用户没给时，Agent 可以先生成草案并在 `creative-doc` 中标注 `copySource: ai-draft`，让用户确认：

- 主标题
- 副标题
- 卖点短句
- 模块顺序
- 详情页 CTA 文案
- 英文 / 双语本地化表达
- 参数表达方式
- 风格细化

不得编造真实事实：价格、检测数据、认证资质、销量、专利、真实用户评价、活动规则。

---

## 四、标准 form-fields

`[skill:ecom-image/detail]` 信息不足时，首轮使用以下字段。字段数量较多，但这是专业详情页 Brief；若用户说"你来定 / 直接做"，可用平台默认值 + AI 草案直出 `creative-doc`。

```form-fields
[
{"id":"productName","label":"产品 / 品牌名","type":"text","required":true,"placeholder":"如：戴森 V12 吸尘器、小白儿童牙膏"},
{"id":"productAsset","label":"产品图（强烈建议上传）","type":"upload","required":false,"hint":"上传后详情页所有产品模块都会走于同一产品图重绘，保持 Logo / 外观 / 配色一致"},
{"id":"category","label":"类目","type":"select","required":true,"options":[{"label":"数码 3C","value":"digital3c"},{"label":"家用电器","value":"appliance"},{"label":"服饰内衣","value":"apparel"},{"label":"鞋靴箱包","value":"shoebag"},{"label":"钟表珠宝","value":"watchjewelry"},{"label":"美妆护肤","value":"beauty"},{"label":"个护健康","value":"personal_care"},{"label":"家居日用","value":"home_living"},{"label":"其他/通用","value":"general"}]},
{"id":"platform","label":"投放平台","type":"select","required":true,"options":[{"label":"淘宝/天猫","value":"taobao"},{"label":"京东","value":"jd"},{"label":"拼多多","value":"pdd"},{"label":"亚马逊 A+","value":"amazon"},{"label":"抖音小店","value":"douyin"},{"label":"小红书","value":"xiaohongshu"},{"label":"视频号小店","value":"weixin"},{"label":"通用","value":"general"}]},
{"id":"language","label":"详情页语种","type":"select","required":true,"options":[{"label":"中文","value":"zh"},{"label":"英文","value":"en"},{"label":"中英双语","value":"zh-en"},{"label":"AI 根据平台决定","value":"auto"}],"default":"auto"},
{"id":"copyMode","label":"文案模式","type":"select","required":true,"options":[{"label":"我提供文案，AI 负责排版和视觉化","value":"user-copy"},{"label":"AI 根据产品信息起草一版，我确认","value":"ai-draft"},{"label":"我有粗略卖点，AI 润色成详情页文案","value":"ai-polish"}],"default":"ai-draft"},
{"id":"sellingPoints","label":"核心卖点 / 用户已有卖点文案","type":"text","required":false,"placeholder":"如：12000Pa 大吸力 / 紫外线杀菌 / 无线轻量化；也可以粘贴完整卖点文案"},
{"id":"mainTitle","label":"主标题（可选，AI 可代写）","type":"text","required":false,"placeholder":"如：深层除螨，一次吸净看不见的脏"},
{"id":"subTitle","label":"副标题（可选，AI 可代写）","type":"text","required":false,"placeholder":"如：大吸力 + UV 杀菌 + 可水洗滤芯，守护每晚洁净睡眠"},
{"id":"targetAudience","label":"目标人群（可选）","type":"text","required":false,"placeholder":"如：宝妈、租房青年、宠物家庭、户外爱好者"},
{"id":"useScenarios","label":"主要使用场景（可选）","type":"text","required":false,"placeholder":"如：卧室床品清洁 / 差旅收纳 / 办公桌面 / 厨房台面"},
{"id":"styleDirection","label":"视觉风格","type":"select","required":false,"options":[{"label":"高端极简","value":"premium-minimal"},{"label":"科技感 / 参数感","value":"tech-spec"},{"label":"温馨生活方式","value":"warm-lifestyle"},{"label":"强促销 / 高转化","value":"promo-conversion"},{"label":"亚马逊 A+ 简洁专业","value":"amazon-a-plus"},{"label":"AI 根据产品和平台决定","value":"auto"}],"default":"auto"},
{"id":"mainColor","label":"品牌主色 / 色彩偏好（可选）","type":"text","required":false,"placeholder":"如：深蓝 #2A5C8F、橙色 #FF6B35"},
{"id":"specifications","label":"参数 / 规格 / 材质（可选）","type":"text","required":false,"placeholder":"如：功率、容量、尺寸、材质、型号、认证信息"},
{"id":"complianceNotes","label":"禁用词 / 合规限制（可选）","type":"text","required":false,"placeholder":"如：不能写治疗、不能夸大功效、不要出现绝对化用语"}
]
```

---

## 五、详情页模块标准

### 5.1 默认 7 模块

| # | 模块 | 传播功能 | 默认画位 |
|---|------|---------|---------|
| 1 | 首屏 KV | 建立第一眼吸引 + 产品定位 | 主标题 + 产品英雄图 |
| 2 | 痛点 / 场景 | 让用户觉得"这是我的问题" | 场景图 / 对比图 |
| 3 | 核心卖点 1 | 讲最强利益点 | 卖点图 |
| 4 | 核心卖点 2 | 补充第二购买理由 | 卖点图 |
| 5 | 核心卖点 3 | 补充功能 / 参数 / 人群价值 | 卖点图 |
| 6 | 细节 / 材质 / 工艺 | 建立品质信任 | 细节图 |
| 7 | 使用场景 / 信任收束 | 代入生活 + CTA / 品牌收束 | 用户使用图 |

### 5.2 轻量 5 模块

适合用户要"详情页速化包 5 张"：

1. 首屏 KV
2. 核心卖点 1
3. 核心卖点 2
4. 细节 / 材质
5. 使用场景 / 信任收束

### 5.3 亚马逊 A+ 模块

`platform=amazon` 或 `language=en / zh-en` 且用户选 A+ 风格时：

- 文案默认英文或双语
- 模特 / 场景默认欧美生活方式
- 单位默认英制（inch / lb / fl oz）
- 避免比较竞品和未经证明的疗效
- 模块更克制，降低强促销语气

### 5.4 模块默认比例（铁律）

详情页是**长图切片**，不是主图集。每个详情页模块在画布上是一张独立切片，串起来在淘宝/京东/小红书等平台上是连续滑屏阅读。**禁止把 8 图主图的 1:1 默认套用到详情页模块**——这是本 SOP 的高频踩坑点。

| 模块 | 默认 aspectRatio | 备选 | 严禁 |
|------|-----------------|------|------|
| 首屏 KV | **3:4** | 4:5 / 16:9 | 1:1 |
| 痛点 / 场景 | **4:5** | 3:4 | 1:1 |
| 卖点模块 | **3:4** | 4:5 / 1:1 | — |
| 细节 / 材质 | **1:1** | 4:5 | — |
| 使用 / 收束模块 | **4:5** | 3:4 | 1:1 |

**平台动态适配**：

- 小红书：所有模块统一上 **3:4**。
- 抖音/视频号：首屏 KV 9:16/4:5，其余 4:5。
- 淘宝/京东/拼多多：按上表默认可调。

---

## 六、creative-doc 标准结构

Step 2 必须输出 `creative-doc(type=ecom-detail-page-plan)`，让用户确认详情页策略、文案和模块，不要直接进入 Prompt Pack。

```creative-doc
{
"type": "ecom-detail-page-plan",
"title": "{productName} 详情页策划与模块编排",
"domain": "ecom-image",
"phase": 1,
"totalPhases": 3,
"checkpoint": true,
"checkpointPrompt": "详情页 Brief 和模块规划已完成，下一步？ A 确认开始生成 / B 修改主副标题 / C 调整卖点文案 / D 调整模块顺序 / E 换视觉风格",
"sections": [
{
"heading": "详情页 Brief",
"layout": "key-value",
"data": {
"productName": "...",
"category": "...",
"platform": "...",
"language": "zh | en | zh-en | auto",
"copyMode": "user-copy | ai-draft | ai-polish",
"styleDirection": "...",
"anchorMode": "user-upload | white-bg-first",
"deliveryRounds": "1 | 2"
}
},
{
"heading": "主文案策略",
"layout": "key-value",
"data": {
"mainTitle": "...",
"subTitle": "...",
"copySource": "user-provided | ai-draft | ai-polished",
"languagePolicy": "...",
"complianceNotes": "..."
}
},
{
"heading": "详情页模块编排",
"layout": "table",
"data": [
{"moduleId":"M1","模块":"首屏 KV","传播功能":"建立第一眼吸引","主标题":"...","副标题":"...","视觉策略":"产品英雄图 + 品牌主色背景","subType":"image-image","anchor":"上传产品图 / 主锚白底"},
{"moduleId":"M2","模块":"痛点 / 场景","传播功能":"引发需求","主标题":"...","副标题":"...","视觉策略":"真实使用场景 + 痛点可视化","subType":"image-image","anchor":"同上"}
]
},
{
"heading": "视觉系统",
"layout": "key-value",
"data": {
"mainColor": "...",
"typography": "中文粗黑 / 英文 Sans / 高端衬线等",
"layoutRhythm": "首屏强冲击，卖点模块统一卡片化，细节模块微距",
"ratioPlan": "首屏 KV: 3:4 / 卖点 ×3: 3:4（统一）/ 细节: 1:1 / 使用收束: 4:5（按 §5.4 默认表，禁止全 1:1）"
}
},
{
"heading": "下一步选择",
"options": [
{"id":"A","label":"确认方案，开始生成"},
{"id":"B","label":"修改主标题 / 副标题"},
{"id":"C","label":"调整卖点文案"},
{"id":"D","label":"调整模块顺序 / 增删模块"},
{"id":"E","label":"换视觉风格"}
]
}
]
}
```

---

## 七、Prompt Pack 交接字段

用户确认 `ecom-detail-page-plan` 后，`thinking` 中输出：

```thinking
【Ecom Detail Brief】
productName: ...
category: ...
platform: ...
language: ...
copyMode: ...
mainTitle: ...
subTitle: ...
sellingPoints: [...]
styleDirection: ...
modules: [{moduleId, moduleName, title, subtitle, visualStrategy, copySource}]
anchorMode: user-upload | white-bg-first
anchorNodeId: <真实 nodeId，仅进入扇出轮时出现>
deliveryRounds: 1 | 2
handoffSequence: [prompter, engineer]
```

Prompt Pack 中每个模块节点必须包含：
- `moduleId`, `title`, `subType`, `content`, `agentNodeType: prop`
- `aspectRatio` —— **必须按 §5.4 模块默认比例填**，不允许默认 1:1。
- `editAction:redraw`，`edges[]` 指向产品 anchor。

---

## 八、门禁

1. 详情页信息不足 → 先 form-fields。
2. form-fields 回填后 → 先 `creative-doc(type=ecom-detail-page-plan)`。
3. 用户确认方案后 → 才能进入 Prompt Pack。
4. 没有产品图且需要多模块产品一致性 → 必须走 `white-bg-first` 主锚白底流程。
5. `white-bg-first` 下，必须先生成 / 确认主锚白底，再扇出详情页模块。
6. 用户说"你来定 / 直接做"可以跳过 form-fields，但不能跳过 `ecom-detail-page-plan`，除非用户明确说"不要方案，直接出图"。
7. **详情页 Prompt Pack 中所有模块的 `aspectRatio` 不允许全部为 `1:1`**（命中即 `detail-ratio-not-all-square: FAIL`）。

---

## 九、自检

- [ ] 是否收集或代拟了产品、卖点、主标题、副标题、语种、风格？
- [ ] `language` 是否明确，且亚马逊 / 英文场景已本地化？
- [ ] 用户文案是否完整保留，AI 起草是否标注 `copySource=ai-draft`？
- [ ] 真实事实是否未被编造？
- [ ] 模块是否各有传播功能，不是重复卖点出图？
- [ ] 每个模块是否有主标题 / 副标题 / 视觉策略？
- [ ] 是否声明 `anchorMode` 和 `deliveryRounds`？
- [ ] 多模块产品图是否围绕同一 anchor 扇出？
- [ ] 是否先 `creative-doc` 确认，再 Prompt Pack？
- [ ] **每个模块的 `aspectRatio` 是否按 §5.4 填写，且未全部为 1:1？**

