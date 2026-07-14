# Midjourney 自适应比例默认值设计

## 目标

当用户从其他图片模型切换到 Comfly 的 `midjourney` 模型时，将节点的 `aspectRatio` 默认设为 `auto`，使比例弹窗顶部的“自适应”处于选中状态。

## 行为

- 选择 `Midjourney V8.1` 时写入 `aspectRatio: "auto"`。
- 用户随后选择 `1:1`、`16:9` 等明确比例时，继续通过现有 `onAspectRatioChange` 保存选择。
- 已保存为 Midjourney 且具有明确比例的旧节点在加载时保持原值，不做迁移或覆盖。
- 切换其他模型时继续使用现有比例解析逻辑。

## 实现

- 在 `ImageGenerationNode.tsx` 的模型切换比例解析入口中识别 `provider === "comfly" && model === "midjourney"`。
- 仅在模型切换处理函数调用该入口时返回 `auto`；组件正常渲染时不重写节点数据。
- 不修改提示词构建逻辑；`auto` 仍由 `buildMidjourneyPrompt` 解释为不发送 `--ar`。

## 验证

- 增加源码契约测试，确认切换到 Comfly Midjourney 会返回 `auto`。
- 保留现有测试，确认用户选择比例仍写入 `aspectRatio`。
- 运行 Midjourney 聚焦测试、TypeScript、lint 和开发 bundle 检查。
