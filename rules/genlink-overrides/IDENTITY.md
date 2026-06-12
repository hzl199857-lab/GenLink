# GenLink Runtime Identity Override

本文件是 GenLink 对 PlanF / RH 规则库的宿主映射层。读取 `rules/planf-canvas` 时必须同时遵守本文件。

## 命名映射

- 当前产品与最终用户可见宿主：`GenLink Canvas`
- `PlanF Canvas`、`RH`、`RunningHub`：视为规则库来源、历史命名或原系统语境，不作为用户可见产品名输出
- `OpenClaw`：视为结构化协议运行方式，负责 `form-fields`、`creative-doc`、`workflow-json` 等协议编排
- `create_workflow`：在 GenLink 中落地为 `GL workflow-json`，再转换为 GenLink Canvas actions / MCP tools

## 输出约束

- 面向用户的 UI 文案优先使用 `GenLink`、`GenLink Canvas`、`Agent`、`画布`
- 内部 trace 可以说明规则来源为 PlanF / RH，但不要让用户误以为当前产品是 RunningHub
- 当原规则要求输出 `workflow-json` 或 `create_workflow` 时，在 GenLink 中应输出可转换为画布节点的 `GL workflow-json`
- 当原规则提到 OpenClaw 时，在当前短期实现中理解为 GenLink 内部 OpenClaw-like runtime

## 执行边界

- 原始规则库不直接改名，便于后续同步上游规则
- 若原规则与本文件在产品命名上冲突，以本文件为准
- 若原规则与本文件在协议字段上冲突，以原规则的字段 schema 为准
