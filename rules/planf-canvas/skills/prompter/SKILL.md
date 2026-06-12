---
name: prompter
description: 图片提示词创作（delta）。所有共性规则见 skills/_shared/prompter-core.md。
metadata: {"openclaw":{"emoji":"🎨"}, "planF":{"phase":["C"],"media":["image"]}}
user-invocable: false
---

# Skill: prompter

> 共享规范：
> - 工程契约 / Prompt Pack 骨架 / 通用 Post-check 见 `skills/_shared/prompter-core.md`
> - 图片主链 / 能力地图 / 分档见 `IMAGE_PIPELINE.md`
> - **图片质量心智**（8 维度框架 / 抽象→视觉翻译 / 反廉价感 / 默认审美增强 / 多图多样性）见 `skills/_shared/image-aesthetic.md`
> - 上传图 / 画布节点角色判定见 `skills/_shared/image-asset-role.md`
> - 海报 / 单页 / 封面文案版式见 `skills/_shared/image-single-page-layout.md`
> - 跨节点资产一致性见 `skills/_shared/asset-consistency.md`
>
> 本文件只声明**图片领域的 delta**，不复述通用字段约束、通用 Post-check、通用 Prompt Pack 骨架，也不复述图片质量心智。

## Contract

### Input

- **Required**: goal, targetMedium, subject
- **Optional**: referenceRole, visualDirection, artStyle, assetRegistry, promptDeltas, constraints
- **Validation**:
- goal 不能为空 → reject
- targetMedium 必须包含 image → reject
- 有 assetRegistry 时必须按 `skills/_shared/asset-consistency.md` 规则引用 → warn

### Output

- **Format**: `thinking` 中的 `【Prompt Pack】`（骨架见 `_shared/prompter-core.md § 三`）
- **领域专属 Validation**:
- 漫剧角色设定图必须包含左侧大头照 + 右侧三视图 + 明确体态比例 + 纯白底 + 左右布局显式声明 → reject
- `image-image` 编辑类 content 必须写成"保留 X + 仅改 Y"，不能写成从零生成整张图 → reject

### Concurrency

- safe: false | conflictsWith: `reverse-engineer`
- prerequisites: `analyst`（快速道且无领域增量时可跳过）
- handoff to: `engineer`

### Prompt Strategy

- **动态**:
- 漫剧 Round 1 → 角色设定图模板（§ 二）
- 有 `assetRegistry` → 按 `_shared/asset-consistency.md` 用完整锚定描述
- 分镜需求 → 宫格分镜板（§ 三）
- 增量编辑类 → 保留 + 变化点模板（§ 四）

## 一、领域心智

- 只为 `text-image` / `image-image` 写中文图片 prompt
- 具体、可执行、不写空话
- 每段 prompt 对应一个图片节点
- 不把视频运镜语言塞进图片 prompt
- **质量护栏**: 所有 prompt 撰写必须遵循 `_shared/image-aesthetic.md`，重点维度必须有具体控制描述，抽象审美词必须翻译为画面控制
- **资产角色优先**: 有图片输入或画布节点时，先按 `_shared/image-asset-role.md` 判断是主体 / 待编辑素材 / 风格参考 / 构图参考 / 反推对象，再决定 `text-image` / `image-image` / `image-text`
- **单页版式优先**: 海报、封面、宣传单页类 prompt 必须叠加 `_shared/image-single-page-layout.md` 的信息层级和文案七要素，不只写画面氛围

## 一.5 图片质量心智速查（高频参考，详见 `_shared/image-aesthetic.md`）

### A. 按任务类型选重点维度

| 任务类型 | **重点维度**（必须具体描述） | 可简化维度 |
|----------|--------------------------|----------|
| 产品 / 电商图 | 主体、材质、光影、背景 | 场景纵深、用途适配 |
| 人像写真 | 主体、光影、色彩 | 材质细节、用途适配 |
| 海报 / 封面 | 构图、用途适配、色彩 | 材质、场景纵深 |
| 概念场景 / 插画 | 场景、构图、色彩、光影 | 材质、用途适配 |
| Logo / 品牌标志 | 主体、色彩、背景 | 场景、光影 |
| 生活方式 / 氛围图 | 场景、光影、色彩 | 材质细节、用途适配 |
| 角色设定图 | 主体、构图、色彩 | 场景、光影、材质 |
| 分镜板 | 主体、构图、场景 | 材质、用途适配 |

### B. 抽象词必须翻译（任一抽象词出现 → 同句必须有具体落地）

| 抽象词 | 翻译方向（举几个常用） |
|--------|------------------------|
| 高级感 | 色彩克制 ≤3 色 / 材质统一 / 光线收敛 / 留白合理 |
| 电影感 | 单侧主光 / 高光比 / 色彩分级 / 空间层次 |
| 氛围感 | 光线方向 / 色温 / 背景虚化程度 / 前景遮挡 |
| 质感 | 边缘高光 / 纹理层次 / 表面反射特征 |
| 商业成片感 | 主体突出 / 信息层级 / 缩略图识别度 / 背景干净 |
| 极简 | 色彩 ≤3 / 背景纯净 / 元素受控 / 留白比例明确 |

完整 11 项翻译表见 `_shared/image-aesthetic.md § 二`。

### C. 写"如何实现"，不只写"要什么"

- ❌ "背景高级" → ✅ "背景采用低饱和深灰蓝渐变，中部干净衬托主体，侧边留文案区"
- ❌ "光影有电影感" → ✅ "单侧主光形成明确明暗面，弱轮廓光分离主体与背景，光比偏高"
- ❌ "很有质感" → ✅ "金属表面有清晰受控的高光条带，玻璃边缘有透亮折射"

## 二、角色设定图（漫剧 Round 1）必用模板

```
角色设定参考图，保持人物一致性，多视图展示，纯白色背景，
左侧：角色特大高清大头照或半身近景肖像，突出五官、发型、年龄感与神态细节，
右侧：全身三视图（正面、侧面、背面），自然 A 字站姿或标准站姿，完整展示体型比例、服装层次、鞋履与关键配饰，
[角色外貌与服装锚点描述],
[身材比例与年龄体态描述，按角色定位自适应],
[画风关键词]
```

**结构优先**: 先锁定左大头照 + 右三视图的结构，再决定风格和比例。

**身材比例自适应**（不强制九头身）:

- 英气、写实、成年主角：可偏修长比例
- 少年少女：保持青春体态
- 儿童、Q 版、喜剧向：允许更低头身比

**禁止退化**（以下不算合格角色设稿）:

- 只有单张站立全身像（缺左右结构）
- 只有半身人像或证件照式头像（缺三视图）
- 带复杂环境背景的情绪海报（缺纯白底）
- 只写"古风角色设定图"但没有显式左/右布局声明

## 三、分镜板（`image-image`，需要精确控镜时可选）

`subType: image-image`, `editAction: redraw`，source 是角色/产品参考图。

```
基于参考图重绘为 [N] 宫格故事板（[格式]），[画风]画风，
场景：[场景描述]，
画面内容：各格描述，
主体保持与参考图一致的外貌特征，[主体完整锚定描述]
```

> 分镜是通用可选能力。大多数情况下分场描述 + Sd2.0 能更好地展现剧情，无需走分镜。

## 四、增量编辑模板（`image-image`）

适用于：加帽子、换装、改发型、加配饰、局部替换、保留主体重绘。

```
基于参考图进行重绘，
保留[主体身份 / 五官 / 发型走向 / 眼镜 / 服装主轮廓 / 构图 / 背景 / 画风]，
仅将[变化点]修改为[目标变化]，
其余内容保持一致，
整体仍为[目标风格]
```

额外规则：

- 用户没明确要求时，不要擅自改背景、姿态、镜头距离、构图
- 用户只要求局部改造时，不要把 prompt 写成完整场景重生成
- 角色类编辑优先锚定脸型、发型、眼镜、服装主轮廓和既有画风
- 源图若是画布节点，默认视为"保留主体 + 派生新图"，不是新造角色

## 五、领域专属 Post-check（叠加通用 Post-check）

> 通用图片画面质量自检见 `_shared/image-aesthetic.md § 十二`，本节只列**领域专属**的额外校验。

除 `prompter-core.md § 五` 的 9 条 + `image-aesthetic.md § 十二` 的 8 条之外，图片领域再叠加:

- 漫剧角色设定图 `content` 是否符合模板（左侧大头照 + 右侧三视图 + 明确体态比例 + 纯白底 + 显式左右布局）？
- 若是 `image-image` 增量编辑，`content` 是否写成"保留 X + 仅改 Y"结构?
- 若是 `image-image`，是否声明了 `edges[]`？（至少 1 条入边指向源节点）

## 六、典型示例

### 6.1 单节点 text-image

```thinking
  【Prompt Pack】
action: create
outputProtocol: workflow-json
workflowName: 企鹅插画
executionStage: image
nodes:
- index: 1 | title: 企鹅插画 | subType: text-image | content: 一只可爱的企鹅站在南极冰川上，身穿红色围巾，背景是极光，二次元风格，高清细节 | agentNodeType: illustration | aspectRatio: 1:1
edges:
notes:
```

### 6.2 增量编辑（带 edge + sourceNodeId）

```thinking
  【Prompt Pack】
action: create
outputProtocol: workflow-json
workflowName: 角色加帽子
executionStage: edit
nodes:
- index: 1 | title: 戴帽子的角色 | subType: image-image | content: 基于参考图进行重绘，保留男孩的脸型、棕色短发走向、黑框眼镜、深色连帽背心、人物朝向、背景构图和手绘平涂漫画风格，仅给他戴上一顶深灰色毛线帽，帽子自然贴合头部，其余内容保持一致 | agentNodeType: character | aspectRatio: 1:1 | editAction: redraw
edges:
- source: node-17749abc123 | target: 1
notes:
- 冗余锚点 sourceNodeId=node-17749abc123
```

### 6.3 质量增强对比（坏例 vs 好例）

**任务**: 给一款除螨仪生成电商主图（产品 / 电商类，重点维度 = 主体 / 材质 / 光影 / 背景）。

**坏例**（抽象词堆砌、廉价感未规避）:

```thinking
  【Prompt Pack】
nodes:
- index: 1 | title: 除螨仪主图 | subType: text-image | content: 一台除螨仪，高级感，有质感，商业成片感，干净背景 | agentNodeType: prop | aspectRatio: 1:1
```

问题:
- 抽象词"高级感 / 有质感 / 商业成片感"全部未翻译
- 重点维度（主体 / 材质 / 光影 / 背景）零具体描述
- 模型自由发挥概率高，多图差异化不可控
- Post-check 必 reject

**好例**（按 § 一.5 速查表展开，重点维度全部落地）:

```thinking
  【Prompt Pack】
nodes:
- index: 1 | title: 除螨仪正视图主图 | subType: text-image | content: 一台白色除螨仪居中悬浮于纯白背景，正视图，机身占画面 60%，深灰色操作面板与一抹品牌蓝点缀色，机身 ABS 哑光质感与吸口处镀铬高光带形成材质对比，主光从右上方 45° 入射形成明确明暗面，弱轮廓光分离主体与背景，背景为纯白基础上叠加极轻微浅灰渐变，画面下方留有自然投影增强物理真实感 | agentNodeType: prop | aspectRatio: 1:1
notes:
- 主体 60% 占比、正视图、品牌蓝点缀色 → 主体维度
- ABS 哑光 vs 镀铬高光 → 材质维度
- 45° 主光 + 弱轮廓光 + 光比 → 光影维度
- 纯白 + 浅灰渐变 + 自然投影 → 背景维度
- 4 个重点维度都有具体控制描述，无抽象词残留
```
