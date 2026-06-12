# Ecom Image · AI 造型师风格层

> 本文件是 `ecom-image/SKILL.md` 的子场景风格知识库。`styleMode = stylist` 或 `[skill:ecom-image/stylist]` 触发时强制加载。

>

> **定位**：造型师模式不是新的图集结构，而是**叠加在 8 图标准之上的高级审美层** —— 把电商图的视觉系统从「商业精修」拉升至「Editorial / 时尚大片」级别。

>

> **可与 amazon 叠加**：`[skill:ecom-image/amazon]` + `[skill:ecom-image/stylist]` = 海外编辑大片（西方模特 + High-Fashion 灯光 + 英文 Editorial 签角）。

---

## §1 定位：从「卖货图」到「时装大片」

造型师模式的核心是**建立情绪共鸣而非单纯展示参数**。与 §5.2 通用 8 图（强调信息清晰、功能展示）的区别如下：

| 维度 | 通用电商图 | **AI 造型师大片** |
|------|-----------|-----------------|
| 审美逻辑 | 工业标准、功能导向 | **艺术性优先、情绪驱动** |
| 选角标准 | 亲和力、大众感 | **骨相分明、高级感（Muse 感）** |
| 灯光氛围 | 均匀平光、无死角 | **Cinematic 高光比、阴影层次** |
| 姿态表达 | 标准 pose、展示产品 | **High-Fashion 表现力、非对称动态** |
| 场景逻辑 | 写实居家 / 办公室 | **非写实空间、超现实几何、抽象质感** |
| 文字排版 | 卖点信息图、大字报 | **Editorial 签角、极简字体设计** |
| 信任来源 | 权威背书、清晰参数 | **品牌格调、生活方式投射** |

**心智锚点**：让用户看了第一反应是「**这是哪本时装杂志的内页**」，而不是「这是淘宝搜索结果」。

---

## §2 造型师风格流派库

### 2.1 The Minimalist（极简主义者）

- **适用品牌**：Lemaire 感、极简家居、高客单价个护
- **核心视觉**：大量负空间、同色系、低对比度、纯净光影
- **场景**：大面积留白墙面、抽象几何块面、极轻微的水泥质感
- **灯光**：柔和自然的散射光，无明显阴影边界
- **Prompt 指令**：`monochromatic palette, negative space, soft diffused light, architectural clean lines, understated luxury`

### 2.2 The Avant-Garde（先锋派）

- **适用品牌**：潮流配饰、设计师香水、前卫 3C
- **核心视觉**：锐利的高光、极具张力的姿态、对比色、金属质感
- **场景**：哑黑背景、镜面反射地面、激光束、不规则金属雕塑
- **灯光**：高光比硬光、侧逆光勾勒边缘、局部彩色点光
- **Prompt 指令**：`high contrast lighting, sharp shadows, metallic reflections, surrealistic composition, futuristic edge`

### 2.3 The Classic Elegant（经典优雅）

- **适用品牌**：高级腕表、真丝服饰、经典珠宝
- **核心视觉**：低饱和暖调、对称构图、油画般的细腻质感
- **场景**：欧式古典内装一角、深色丝绒背景、古董家具局部
- **灯光**：伦勃朗光（Rembrandt lighting）、温暖的烛光感照明
- **Prompt 指令**：`timeless elegance, warm cinematic tones, chiaroscuro lighting, rich textures, sophisticated atmosphere`

### 2.4 The Street Rebel（街头叛逆）

- **适用品牌**：潮鞋、滑板周边、运动补剂、街头服装
- **核心视觉**：广角畸变视角、粗粝胶片感、动态抓拍、高饱和度
- **场景**：涂鸦墙面、工业废墟、夜间霓虹街道、篮球场
- **灯光**：闪光灯过曝效果、失真的冷暖混合光
- **Prompt 指令**：`raw urban aesthetics, lo-fi film grain, direct flash, low angle distortion, vibrant street energy`

### 2.5 The Ethereal Dreamer（空灵梦幻）

- **适用品牌**：仙女裙、护肤品、花艺产品
- **核心视觉**：高调曝光（High-key）、薄雾感、梦幻色散、轻盈姿态
- **场景**：繁花丛中、流动的水汽背景、透明亚克力层叠
- **灯光**：逆光透射、彩虹色散眩光、梦幻柔焦
- **Prompt 指令**：`dreamy bokeh, high-key lighting, pastel dreamy palette, translucent layers, ethereal fairy-like mood`

---

## §3 模特造型系统

### 3.1 面部特征与骨相

AI 造型师拒绝平庸的「网红脸」，强制追求**具备镜头表现力的骨相**：

- **面部轮廓**：下颌线清晰锐利、颧骨略高但柔和、眼窝深邃。不要过度饱满的苹果肌。
- **眼神表达**：疏离感、专注、或是带有叙事性的凝视，避免空洞的模特假笑。
- **肤质**：保留真实的皮肤肌理（毛孔、细微瑕疵），杜绝蜡感磨皮。
- **Prompt 关键词**：`defined bone structure, sharp jawline, cinematic facial shadow, raw skin texture, narrative gaze`

### 3.2 姿态表达（High-Fashion Poses）

姿态必须打破重力的物理常规，展现**时尚表现力**：

- **非对称性**：肩膀高低错落、重心偏移、大弧度的肢体延展。
- **动态瞬间**：行走中的残影、跳跃的定格、被风吹乱的衣摆。
- **手部动作**：骨感分明的手指，轻轻触碰脸颊或互动产品，动作要「轻」且「稳」。
- **Prompt 关键词**：`asymmetrical silhouette, high-fashion editorial pose, dynamic movement, avant-garde tension, graceful finger positioning`

### 3.3 妆造系统

- **妆容**：湿亮感眼影、雾面唇妆、或是带有艺术性的局部彩绘。拒绝平庸的日常全妆。
- **发型**：具备体块感的造型（Sculptural hair）、湿发感（Wet-look）、或是极具动感的飞扬发丝。
- **服装搭配**：即便用户提供基础款，AI 造型师也会通过**叠穿（Layering）**或特殊的**面料垂感**来增强画面复杂度。

---

## §4 摄影灯光方案（Cinematic Lighting）

造型师模式**严禁使用平庸的影棚全亮光**，必须通过光影创造雕塑感：

- **单点硬光**：制造强烈的阴影边缘（Sharp shadows），模拟顶级秀场射灯。
- **影调策略**：高光区偏向暖白或微冷冰蓝，阴影区保留深邃细节。
- **光影质感**：利用格栅光、水波纹影、或是百叶窗阴影增加画面叙事性。
- **Prompt 关键词**：`hard lighting, high-contrast chiaroscuro, sharp silhouettes, water ripple shadow, dramatic interplay of light and dark`

---

## §5 场景系统：非写实空间

产品不再置于现实的家中，而是处于**具有隐喻色彩的艺术空间**：

- **几何极简**：巨大的清水混凝土圆柱、悬浮的石阶、无限延伸的走廊。
- **质感对比**：产品（如细腻皮革）与场景（如粗糙岩石、流动液体、液态金属）形成视觉冲突。
- **色彩策略**：场景色调通常服务于产品主体色，采用互补色或同色系的高级灰度。
- **Prompt 关键词**：`minimalist sculptural backdrop, architectural brutalism, abstract material contrast, high-end installation art vibe`

---

## §6 文字策略

造型师图**不放卖点信息图**，但允许 minimalist editorial 字签：

| 套图位置 | 文字策略 |
|---------|---------|
| 5 张全部 | **默认零文字**；完全靠图说话 |
| 例外：editorial 签角 | 单图角落可加 minimal sans-serif 小字（如 "AW26" / "EDITION 02"），≤ 8 字英文 |
| 例外：封面图 | 类杂志封面式排版（大字 + 小字 + 期号），但仍不卖卖点 |

**反例**：

- ❌ 大字「12000Pa 大吸力」叠加在编辑大片上
- ❌ 左右分屏「卖点对比」
- ❌ 中文促销红字

---

## §7 与通用 8 图的映射（叠加策略）

造型师风格层激活后，对 §5.2 通用 8 图的影响：

| # | 通用 8 图图位 | 造型师模式下的处理 |
|---|-------------|-----------------|
| 1 | 白底图 | **保留**（平台准入必须，仍走精修商品摄影；不受造型师影响） |
| 2 | 场景图 A 具象 | **替换为 Archetype 1 全身大片** |
| 3 | 场景图 B 抽象 | **替换为 Archetype 2 全身大片**（不同 Aesthetic Vibe） |
| 4 | 卖点图 1 | **取消**（造型师不做卖点信息图） |
| 5 | 卖点图 2 | **取消** |
| 6 | 卖点图 3 | **取消** |
| 7 | 用户使用图 | **替换为 Archetype 3-4 半身编辑大片** |
| 8 | 细节图 | **替换为 Archetype 5 hero product 高级感细节特写**（如 hand holding bag handle / scarf flowing in breeze） |

**默认造型师套图配置**：1 张白底图 + 5 张 Archetype 编辑大片 = 6 张套图。

---

## §8 触发与集成

### 8.1 触发方式

- 显式标签：`[skill:ecom-image/stylist]`
- 用户文本关键词：造型师 / 编辑大片 / 高奢感 / Editorial / Lookbook / 时尚大片 / Vogue 感 / 高转化模特图 / 高级模特图 / Fashion Stylist / 大片感
- form-fields 中 `styleMode` 字段选择 `stylist`

### 8.2 form-fields 增量

造型师模式下追加字段：

```json
[
  {
    "id": "archetypeCount",
    "label": "Archetype 数量",
    "type": "select",
    "required": false,
    "default": "5",
    "options": [
      {"label": "3 个 Archetype（精简套图，约 4 张）", "value": "3"},
      {"label": "5 个 Archetype（完整 5 大片，约 6 张）", "value": "5"},
      {"label": "7 个 Archetype（深度多人设套图，约 8 张）", "value": "7"}
    ]
  },
  {
    "id": "aestheticVibePreference",
    "label": "偏好 Aesthetic Vibe（多选，会进入 Archetype 设计）",
    "type": "multi-select",
    "required": false,
    "options": [
      {"label": "Minimalist 极简", "value": "minimalist"},
      {"label": "Edgy 锐感", "value": "edgy"},
      {"label": "Romantic 浪漫", "value": "romantic"},
      {"label": "Athleisure 运动休闲", "value": "athleisure"},
      {"label": "Bohemian 波西米亚", "value": "bohemian"},
      {"label": "Preppy 学院", "value": "preppy"},
      {"label": "Dark Academia 暗黑学院", "value": "dark_academia"},
      {"label": "Old Money 老钱", "value": "old_money"}
    ]
  },
  {
    "id": "environmentPreference",
    "label": "环境偏好",
    "type": "select",
    "required": false,
    "options": [
      {"label": "Raw Concrete 工业混凝土", "value": "raw_concrete"},
      {"label": "Warm Sandstone 暖沙岩", "value": "warm_sandstone"},
      {"label": "Gallery White 画廊白", "value": "gallery_white"},
      {"label": "Mid-Century Modern Interior 中世纪现代室内", "value": "midcentury_interior"},
      {"label": "Glass Architecture 玻璃建筑", "value": "glass_architecture"},
      {"label": "AI 帮我搭配", "value": "auto"}
    ]
  }
]
```

### 8.3 与 amazon 叠加

`amazonMode=true` + `styleMode=stylist`：
- 模特默认 Western/Caucasian / Euro-American 高级感模特
- 面部结构、肤色基调、发质必须 align with Euro-American high-fashion standards
- 所有文本（极少量 caption）默认英文
- 场景默认 Western context（NYC loft / LA gallery / European architecture / Soho studio 等）
- 配饰默认 Western fashion brands aesthetic（不引用具体品牌名）

> **海外编辑大片模特维度的传统硬约束**：选角强制锚定到 Western / Caucasian 高级感模特，面部结构、肤色基调、发质需贴合欧美时尚审美范式以维持品牌在西方市场的共鸣。**只在 amazon 叠加或用户明确说"出海 / 海外 / 欧美市场"时生效**；国内市场默认仍按品类适配。

---

## §9 输出格式（Strategic Matrix）

造型师风格的 `creative-doc(type=ecom-image-plan)` 必须额外包含一个 `Strategic Matrix` section，按以下结构组织：

```creative-doc
{
  "heading": "Strategic Matrix · 5 Archetypes",
  "layout": "table",
  "data": [
    {
      "#": "Archetype 1",
      "Name": "The Minimalist Executive",
      "Lifestyle Narrative": "周一早晨 8 点，硅谷 SaaS CEO，刚下飞机直奔会议",
      "Converts For": "硅谷 / 互联网 / 25-40 / 高 LTV",
      "Aesthetic Vibe": "Minimalist + Old Money",
      "Physique": "Athletic",
      "Complexion": "Olive",
      "Top-5 Edit": "Cashmere turtleneck / Navy blazer / Gold hoops / Leather tote / White sneakers",
      "Environment": "Glass Architecture",
      "Pose": "The Mid-Stride"
    }
  ]
}
```

---

## §10 Pre-check（造型师专项）

造型师模式下，编排清单和 Prompt Pack 必须额外跑：

- [ ] 是否输出了完整的 Strategic Matrix（5 个 Archetype 完整字段）
- [ ] 每个 Archetype 是否有 Lifestyle Narrative + Converts For + 3 维度 Muse Profile
- [ ] Top-5 Edit 是否按"如何抬升 hero product"排序，不抢戏
- [ ] Hyper-Realism Guardrails 是否在 prompt 中显式声明（visible pores / micro-textures / natural light）
- [ ] Product Fidelity 是否显式锚定 hero product 的 Logo / 五金 / 缝线 / 材质
- [ ] 姿态是否使用编辑级 pose 库（Mid-Stride / Soft Lean / Seated Profile 等），不用证件照式
- [ ] amazonMode 叠加时模特是否西方/欧美 + 场景是否 western context
- [ ] 文字是否极少（默认零文字 / ≤ 8 字 editorial 签角）
- [ ] 是否未叠加传统卖点信息图

---

## §11 反模式（直接 reject）

1. ❌ Archetype 只写"漂亮女模特"类空话，缺 3 维度 Muse Profile
2. ❌ Top-5 Edit 抢 hero product 戏（如配饰比 hero 更显眼）
3. ❌ 标准 catalog 摆 pose（正面凝视 + 微笑）
4. ❌ 塑料感完美皮肤（无毛孔 / 过度磨皮）
5. ❌ 配饰 / 道具是凭空捏造的真实品牌名（违反 §7.1 广告法）
6. ❌ 在编辑大片上叠加大字卖点信息图
7. ❌ Archetype 之间高度重叠（同一种 Vibe 出 5 张）
8. ❌ 同一张图同时强调造型师精修 + UGC 真实感两种气质（互斥）
9. ❌ 国内市场强行用西方/欧美模特（除非用户明确出海或亚马逊）
10. ❌ 5 个 Archetype 未对应 5 类不同客群（无法转化分层）
