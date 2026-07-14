# Midjourney 比例菜单精简设计

## 目标

仅为 Comfly 的 `midjourney` 模型提供更直观的比例选择弹窗，并移除不适合 Midjourney 工作流的并行数量入口。其他图片模型继续使用现有设置和并行数量交互。

## 比例弹窗

Midjourney 模式下，比例弹窗改为两段式布局：

1. 顶部显示“分辨率”标题和一个占满整行的“自适应”按钮，对应现有 `aspectRatio = "auto"`。
2. 中间显示“比例”标题和卡片式比例按钮，仅保留：
   - `1:1`
   - `9:16`
   - `16:9`
   - `3:4`
   - `4:3`
   - `3:2`
   - `2:3`

不显示 `4:5`、`5:4`、`2:1`、`21:9`、`9:21`，也不在比例弹窗中加入“生成数量”区域。

## 并行数量

当 `isComflyMidjourneyModel(provider, model)` 为真时：

- 隐藏提示栏右侧现有的 `x1 / x2 / x4` 数量按钮。
- 隐藏其数量下拉菜单。
- 生成按钮继续正常显示和工作。

非 Midjourney 模型保留当前 `x1 / x2 / x4` 行为，不修改节点数据结构和服务端并行生成契约。

## 实现边界

- 复用现有 `RatioIcon` 和 `onAspectRatioChange`，不增加第二套比例数据字段。
- 在 `ImageGenerationPromptBar.tsx` 内增加 Midjourney 专属比例列表和条件渲染。
- 不修改 Midjourney 提示词参数归一化、V8.1 参数、参考生图和四宫格放大流程。
- 中文文案使用“分辨率”“自适应”“比例”。

## 验证

- 源码契约测试确认 Midjourney 比例列表严格为 7 个指定值。
- 测试确认“自适应”独立于比例卡片区域。
- 测试确认 Midjourney 隐藏并行数量控件，而其他模型仍保留。
- 运行聚焦测试、`npx tsc --noEmit`、`npm run lint` 和 `git diff --check`。
