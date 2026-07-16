# 首页 Agent API Key 门控设计

## 目标

修复首页 Agent 请求进入画布后未发送的问题，并在首次使用、尚未配置可用 Agent API Key 时，引导用户先完成配置。配置成功后自动继续原任务，不要求用户重复输入或再次点击发送。

## 根因

当前 `CanvasAgentPanel` 在处理 `initialRequest` 时，先把请求 ID 写入 `consumedInitialRequestIdRef`，再通过 `setTimeout(0)` 延迟调用 `submitAgentRequest`。面板初始化期间的状态更新可能改变 effect 依赖并清理该计时器，但请求 ID 已被标记为消费，后续 effect 不会重试，因此任务会静默丢失。

同时，首页进入画布的初始请求没有 API Key 门控。即使初始提交链正常运行，没有可用 Key 时也只能在请求阶段失败，无法提供首次使用所需的明确配置流程。

## 交互流程

### 已配置可用 Key

1. 用户在首页提交 Agent 任务。
2. 应用创建未命名项目并进入画布。
3. Agent 面板自动打开。
4. 初始请求立即提交。
5. 只有提交被接受后，才通知首页清除该初始请求。

### 未配置可用 Key

1. 用户在首页提交 Agent 任务。
2. 应用创建未命名项目并进入画布，Agent 面板保持打开。
3. 初始请求保持待处理，不进入 Agent 执行，也不标记为已消费。
4. 自动打开现有 `ApiSettingsPanel`，显示提示：`请先填写 Comfly 或贞贞AI工坊 API Key，保存后将自动继续当前任务。`
5. 用户保存至少一个可用的 Agent Key 后，设置面板关闭，原任务自动提交一次。
6. 用户取消设置时，设置面板关闭，但原任务继续保留；用户之后可通过画布设置入口重新配置。

## 可用 Key 判定

Agent 文本 Provider 目前只支持 `comfly` 和 `zhenzhen`。判定逻辑必须与 Agent 实际请求选择凭据的逻辑一致：

- 优先使用请求指定 Provider 的 Key。
- 其次检查当前文本/图像 Provider。
- 最后检查其余受支持的 Agent Provider。
- 文本 Key 和已有的同 Provider 图像 Key 都视为可用，因为当前设置面板会把同一 Provider Key 同步保存到文本和图像配置。

该逻辑放在独立纯 helper 中，画布门控和 `CanvasAgentPanel` 的请求配置共同复用，避免出现“门控认为可提交，但运行时找不到 Key”的分叉。

## 组件职责

### `src/lib/agent-api-key.ts`

- 从 `StoredApiSettings` 和首选 Provider 中解析实际 Agent 凭据。
- 暴露布尔判定，供初始请求门控使用。
- 不访问浏览器存储，不修改状态。

### `src/components/canvas/InfiniteCanvas.tsx`

- 根据当前 `initialAgentRequest` 和 `apiSettings` 计算是否阻塞。
- 阻塞时自动打开现有 API 设置面板并设置首次使用提示。
- 将阻塞状态传给 Agent Dock/Panel，使面板可见但请求不执行。
- 保存设置时先持久化并更新本地状态；存在可用 Key 后解除阻塞并由现有初始请求 effect 自动续交。
- 取消设置不清除初始请求。

### `src/components/canvas/ApiSettingsPanel.tsx`

- 增加可选提示文案属性。
- 提示显示在现有说明区域，不创建第二个设置弹窗。
- 普通手动打开设置时不显示首次使用提示。

### `src/components/canvas/CanvasAgentPanel.tsx`

- 初始请求阻塞时不提交、不消费。
- 去掉可能丢请求的延迟计时器，或确保请求 ID 只在提交被接受后写入。
- `submitAgentRequest` 返回是否接受提交；只有返回成功才调用 `onInitialRequestConsumed`。
- 多图选择等已接受但等待用户决策的流程也视为已成功消费初始请求。

## 错误处理

- 保存空设置时，如果仍有待处理首页任务，设置面板保持打开并继续显示提示。
- API 请求后续返回 Provider 错误时，沿用 Agent 面板现有可重试错误消息，不重新打开设置面板。
- 请求被 busy 或其他用户决策阻塞时，不消费初始请求，等条件解除后重试。

## 测试

- 纯 helper：首选 Provider、后备 Provider、文本/图像 Key 和无 Key 情况。
- 初始请求：阻塞时不调用提交和消费；解除阻塞后提交一次并消费一次。
- 竞态回归：请求不能在 effect 清理后处于“已消费但未提交”状态。
- API 设置：首次使用提示可见，普通打开设置不显示提示。
- 画布接线：无 Key 自动打开设置；有效保存解除阻塞；取消不清除请求。
- 最终运行聚焦测试、`npx tsc --noEmit` 和 `npm run lint`。
