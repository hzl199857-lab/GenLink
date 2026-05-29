# 视频节点「裁剪视频」功能完整实现说明

> 用途：本文档完整描述 AI-CanvasPro 中视频节点「裁剪视频」（VideoClip）功能的交互、UI、后端接口与实现细节，便于在其他项目中复刻该功能。

---

## 一、功能概览

这是一个嵌入在画布节点上的**视频时间轴裁剪器**。点击视频节点工具栏的「裁剪」按钮后，进入一个"裁剪模式"：整个画布变暗、只高亮当前视频节点，节点下方弹出一条带缩略图的时间轴。用户通过拖动两端手柄、键盘、滚轮选取一段区间，确认后调用后端 ffmpeg 裁出新视频，并在画布上生成一个新节点。

附带两个能力：
- **智能剪辑**：自动按镜头切成多段。
- **提取视频帧**：截当前帧为图片节点。

整体由三部分组成：

| 模块 | 文件 | 职责 |
|---|---|---|
| 前端控制器 | `src/modules/VideoClipController.js`（~74KB 单例） | UI、交互、调后端、生成新节点 |
| 后端接口 | `server.py` + `backend/services/local_media_processing_route_service.py` | `cut` 裁剪单段、`smart_clip` 智能多段 |
| 工具栏按钮 | `src/components/nodeToolbar/videoActions/clipAction.js` | `.act-clip`「裁剪视频」按钮绑定 |
| 样式 | `style.css` 中 `v2-video-clip*` | 时间轴与"聚光灯"模式 CSS |

---

## 二、入口与模式切换

### 工具栏按钮绑定（`bindVideoClipAction`）

1. 点击 `.act-clip` 按钮时先做**互斥检查**：
   - 已在裁剪模式 → toast「请先退出裁剪视频模式」
   - 在抠像模式 → toast「请先退出抠像模式」
2. 先静默退出抠像控制器：`VideoKeyingController.exit({silent:true})`。
3. 调用 `window.v2FocusOnNode(nodeId, padding, durationMs, maxZoom)` 把画布平滑聚焦/缩放到该节点，等 `durationMs` 后再 `VideoClipController.init(nodeId)`（没有聚焦函数则立即 init）。

### 进入裁剪模式的视觉处理（"聚光灯"效果）

通过 CSS 类切换实现，是关键体验：

- `#v2-wrap` 加 `is-video-clip-mode`：除当前节点外的所有节点、连线、提示面板都变成
  `opacity:.12; filter:saturate(.6); pointer-events:none`，背景叠一层暗色遮罩。
- 当前节点加 `is-video-clip-target`：`opacity:1; filter:none`，并隐藏它自己的浮动工具栏。
- 节点本身加 `is-video-clipping`：把节点内的播放控件、静音键、上传提示、多选切换等覆盖层 `display:none`（记住原值，退出时还原）。

涉及的覆盖层选择器：`.video-controls, .video-mute-btn, .node-upload-hint, .video-center-indicator, .gen-video-center-indicator, .multi-toggle-btn`。

---

## 三、生命周期

### `init(nodeId)`

1. 无 `nodeId` 直接返回。
2. 若已 `active`，先 `exit({silent:true})`。
3. 查 `appStore.getState().nodes[nodeId]`，不存在则返回。
4. 置 `active=true, nodeId, anchorNodeId`。
5. `appStore.setVideoClipState({active:true, nodeId})`（发布模式到全局 store，供工具栏互斥判断读取）。
6. `_mountWhenReady()`。

### `_mountWhenReady()`

用 `requestAnimationFrame` 轮询等待节点 DOM 出现（最多重试 10 次，超时则静默退出）。找到后按序执行：
`_applyFrozenUI(true)` → `_applyDimMode(true)` → `_createUI()` → `_bindEvents()` → `_syncDurationAndDefaults()` → `_render()`。

### `exit({silent=false})`

幂等。置 `active=false`，自增 `_thumbToken`（作废在途缩略图任务），`setVideoClipState({active:false})`，取消所有 RAF、移除所有监听（keydown / pointer / document pointerdown / video 事件）、置空所有引用、时间归零、`_applyFrozenUI(false)` + `_applyDimMode(false)`、移除裁剪条 DOM。非 silent 时 toast「已取消裁剪视频」。

---

## 四、时间轴 UI 的 DOM 结构

控制器在节点 wrapper 内注入这棵树：

```
div.v2-video-clipbar                       // 整个浮层，吃掉内部 pointerdown/click/dblclick
├─ div.v2-video-cliprow                     // 横排：取消键 + 轨道 + 确认键
│  ├─ button.v2-video-clipbtn.cancel        // ✕ 取消（圆形）
│  ├─ div.v2-video-cliptrack                // 轨道，百分比坐标系，宽 560px / 高 44px
│  │  ├─ div.v2-video-clipthumbs            // 缩略图容器（flex 平铺）
│  │  │  └─ div.v2-video-clipthumb ×10      // 10 张缩略图，backgroundImage
│  │  ├─ div.v2-video-cliprange
│  │  │  ├─ div.v2-video-clipselection      // 选区（高亮窗口，描边 + 外侧遮罩）
│  │  │  ├─ div.v2-video-cliphandle.left    // 左手柄
│  │  │  └─ div.v2-video-cliphandle.right   // 右手柄
│  │  ├─ div.v2-video-clipplayhead          // 播放头竖线
│  │  ├─ div.v2-video-clipticks             // 静态刻度点（纯装饰）
│  │  └─ div.v2-video-cliplabel             // 时长标签 "x.xxs"，浮在选区中央
│  └─ button.v2-video-clipbtn.confirm       // ✓ 确认（圆形）
└─ div.v2-video-cliphelper-row              // 底部一行
   ├─ div.v2-video-cliphelper-left          // 滚动播放的快捷键提示（10 条轮播）
   └─ div.v2-video-clip-actions
      └─ div.v2-video-clip-smartwrap
         ├─ button.v2-video-clip-smartbtn   // "智能剪辑" + 弹出面板
         └─ button.v2-video-clip-framebtn   // "提取视频帧"（圆形小按钮）
```

### 关键定位 CSS

- **`.v2-video-clipbar`**：`position:absolute; left:50%; top:calc(100% + 12px); transform:translateX(-50%) scale(var(--zoom-inv,1)); transform-origin:center top; z-index:9999`。
  - 重点：`scale(var(--zoom-inv,1))` 让裁剪条**不随画布缩放变形**，始终保持原始视觉大小。
  - 纵向 flex 布局，`gap:6px`。
- **`.v2-video-cliprow`**：`display:flex; align-items:center; gap:10px`。
- **`.v2-video-cliptrack`**：`position:relative; width:560px; max-width:min(84vw,720px); height:44px; border-radius:6px; overflow:hidden`，深色背景 + 阴影。
- **`.v2-video-clipthumbs`**：`position:absolute; inset:0; display:flex; opacity:.6; z-index:1`。每张 `.v2-video-clipthumb` 是 `flex:1; background-size:cover; background-position:center`，之间 1px 分隔线。
- **`.v2-video-cliprange`**：`position:absolute; inset:0; pointer-events:none; z-index:2; overflow:hidden`。
- **`.v2-video-clipselection`**：`position:absolute; top:0; bottom:0; 2px 描边; border-radius:4px; z-index:3`。
  - 用 `box-shadow:0 0 0 9999px <遮罩色>` 把选区**外**的部分压暗（经典的"裁剪框挖空"技巧）。
  - 有 `::before` / `::after` 两个 20px 宽伪元素，作为左右边缘的 `ew-resize` 热区。
  - 默认 `grab` 光标，`:active` 变 `grabbing`。
- **`.v2-video-cliphandle`**：`position:absolute; top:50%; width:6px; height:24px; border-radius:3px; transform:translate(-50%,-50%); z-index:10`。
  - 左手柄 `left:0`，右手柄 `left:100%`。
  - `.hover-active` / 选区 `:active` 时变粗变高（`width:8px; height:32px`）并高亮。
- **`.v2-video-clipplayhead`**：`position:absolute; top:0; bottom:0; width:2px; transform:translateX(-50%); z-index:12`。
- **`.v2-video-cliplabel`**：胶囊样式 `padding:2px 10px; border-radius:20px; backdrop-filter:blur(4px); font-variant-numeric:tabular-nums; font-weight:600; z-index:11`，显示选区时长。
- **`.v2-video-clipticks`**：`radial-gradient` 圆点平铺的静态刻度，`background-size:16px 2px; mix-blend-mode:screen`，纯装饰无逻辑。
- **两个圆按钮 `.v2-video-clipbtn`**：`42×42px` 圆形。取消 `.cancel` 是次要灰底，确认 `.confirm` 是白底黑字（禁用 `[data-disabled=true]` 时 `opacity:.45; pointer-events:none`）。hover 上浮 1px + 阴影。
  - 取消图标：inline SVG `M18 6L6 18 / M6 6l12 12`（20×20）。
  - 确认图标：24×24 对勾 polyline `20 6 9 17 4 12`（stroke-width 2.5）。

---

## 五、坐标换算与渲染

轨道是**百分比坐标系**。核心渲染 `_render()`：

```js
leftPct  = startSec / durationSec * 100
widthPct = (endSec - startSec) / durationSec * 100
selection.style.left  = leftPct + '%'
selection.style.width = widthPct + '%'
leftHandle.style.left  = leftPct + '%'
rightHandle.style.left = (leftPct + widthPct) + '%'
label.textContent = (endSec - startSec).toFixed(2) + 's'
label.style.left  = (leftPct + widthPct / 2) + '%'   // 居中在选区上方
```

时长无效时：选区收为 0、手柄归 0、标签显示「加载中...」并居中。

### 缩略图生成 `_renderThumbs()`（异步、可取消）

- 用 `_thumbToken` 自增做取消令牌（退出/重入时作废旧任务）。
- 离屏创建 `<video>`（`muted, playsInline, preload=auto, crossOrigin=anonymous`），等 `loadedmetadata`（**超时 1500ms**）。
- canvas 高度固定 **44px**，宽按视频宽高比算：`max(1, round(videoWidth/videoHeight*44))`。
- 对 10 张缩略图，分别 seek 到 `(i+0.5)/10 * duration`（seek 目标 clamp 到 `[0, duration-0.05]`，**回退超时 450ms**），`drawImage` 后 `toDataURL('image/jpeg', 0.7)` 设为 `backgroundImage`。
- 全程 try/catch 静默失败，缩略图失败不影响功能。完成后释放临时 video（`removeAttribute('src'); load()`）。

### 时长读取

- `_readDurationSec(video)`：优先 `video.duration`（有限且 >0），否则取 `video.seekable.end(...)`，再否则 0。
- `_syncDurationAndDefaults()`：取可见的 `<video>` 元素，暂停并关闭 loop，读时长。无有效选区时设默认 3s 窗口（以视频当前时间为中心）；已有选区则 clamp 进范围。注册 `loadedmetadata`(once) 与 `durationchange` 监听，时长变化时重算。
- `_getVideoEl()`：扫描 wrapper 内所有 `<video>`，跳过隐藏/零尺寸的，优先取有 `currentSrc`/`src` 的。

---

## 六、鼠标拖动交互

`pointerdown` 命中后判定 `_dragMode`（四种）：

| 命中条件 | `_dragMode` | 行为 |
|---|---|---|
| 离选区左缘 20px 内 或点中左手柄 | `'left'` | 拖动入点 |
| 离右缘 20px 内 或点中右手柄 | `'right'` | 拖动出点 |
| 选区内部 | `'move'` | 记录抓取点 `_dragOffsetPx = clientX - selectionRect.left`，整段平移 |
| 选区外 | `'scrub'` | 暂停视频，只移动播放头预览 |

### 像素 → 时间换算（`_handleDragAtClientX`）

```js
ratio    = clamp01((clientX - trackRect.left) / trackRect.width)
posSec   = ratio * durationSec
minRange = Math.min(0.1, durationSec)        // 最小选区 0.1 秒
curLen   = Math.max(minRange, endSec - startSec)
```

- **left**：`startSec = clamp(posSec, 0, endSec - minRange)`，seek 视频到新起点。
- **right**：`endSec = clamp(posSec, startSec + minRange, durationSec)`。
- **move**：保持长度平移，`startSec = clamp(start + Δsec, 0, duration - curLen)`，`endSec = startSec + curLen`，seek 到新起点。
- **scrub**：只设 `video.currentTime = clamp(ratio*duration, 0, duration-0.001)`，移动播放头。

**约束汇总**：最小选区 0.1s；默认/双击重置长度 3s；边缘命中 20px。确认按钮仅在选区有效且 ≥0.1s 时可用。

### Hover 反馈

鼠标在轨道上移动时，靠近边缘 20px 内手柄高亮、光标变 `ew-resize`，否则选区内显示 `grab` 光标。
`pointerup`（capture 阶段）移除 move/up 监听、清 `_dragMode`、移除 `hover-active`。

---

## 七、键盘 / 滚轮快捷键

> ⚠️ 键盘/滚轮步进的帧率**硬编码为 30fps**（每帧 = 1/30 秒），与视频真实帧率无关。

底部轮播 10 条提示（每 4 秒切换一条，含 `hide-up`/`hide-down` 过渡），对应这套快捷键：

| 操作 | 行为 |
|---|---|
| `Esc` | 退出裁剪（toast「已取消裁剪视频」） |
| `Space` | 区间播放/暂停（播放时若播放头在选区外，先跳回起点） |
| `←` / `→` | 整段移动选区 1 帧 |
| `Shift + ←/→` | 整段移动 10 帧 |
| `Ctrl/⌘ + ←/→` | 微调**入点** 1 帧 |
| `Alt + ←/→` | 微调**出点** 1 帧 |
| `I` / `O` | 把入点/出点设到当前播放头位置 |
| 滚轮 | 等同方向键（上滚 = ←），同样支持 Ctrl/Alt/Shift 修饰 |
| 鼠标点击轨道空白 | 播放头跳转（scrub） |
| 双击选区 | 恢复默认 3s（以选区中心展开；距边缘 24px 内的双击忽略，视为拉伸） |

所有移动都会 clamp 到 `[0, duration]` 并保持长度，移动后暂停并 seek。
监听用 `window.addEventListener('keydown', handler, true)`（capture 阶段）。

---

## 八、播放头与区间预览

- `_startPlayheadLoop()`：`requestAnimationFrame` 循环调 `_renderPlayhead()`。
- `_renderPlayhead()`：读 `video.currentTime`，**若正在播放且 currentTime 超出 `[startSec, endSec]`，就把 currentTime 拉回 `startSec`** —— 这就是"区间循环播放"的实现。播放头位置 = `clamp01(currentTime/duration)*100%`，无时长/无视频时 `display:none`。

## 九、确认裁剪（核心后端调用）

### 前端 `_confirm()`

1. 校验 `end > start`，标记按钮 loading（转圈 SVG），toast「⏳ 正在后端裁剪视频...」。
2. 解析源地址：`localPathToUrl(node.localPath) || node.src || node.videoUrl || node.resultUrl`。
3. 两条执行路径：
   - **Electron**：`enqueueElectronMediaTask({kind:'videoCut', nodeId, src, args:{start, end, fps}}, {wait:true, timeout:300000})`。
   - **HTTP**：见下。`allow404Null:true`，404 时提示「后端接口不存在：/api/v2/video/cut（请重启 server.py）」。

**请求体（注意字段名是 `start`/`end`，不是 `startSec`/`endSec`）：**

```json
POST /api/v2/video/cut
{ "src": "output/...", "start": 1.2, "end": 4.2, "fps": 24 }
```

4. **生成新节点**：算安全摆放位置（`calcSafeSpawnPosNearNode`），新建 `type:'source-video'` 节点，名「剪辑自 + 原名」，写入 `videoDuration/videoFps/videoFrameCount/width/height`（`buildVideoCutNodeMeta`），`needsAutoResize:false, fixedSize:true`。然后：
   `addNode` → `setSelectedNodes([newId])` → `commit()`（历史）→ `v2FocusOnNodes([原节点, 新节点])` → 触发本地缓存保存 → toast「✅ 视频裁剪成功，已生成新文件」→ 静默退出。
5. 失败：toast「❌ 视频裁剪失败: …」，重置按钮 loading 状态。

### 后端 `_handle_video_cut`（`local_media_processing_route_service.py`）

请求字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `src` | string（必填） | 虚拟路径，如 `output/...`、`data/uploads/...`；去首 `/`，拒绝 `..` 穿越 |
| `start` | number（秒） | 默认 0 |
| `end` | number（秒） | 默认 0，必须 `end > start` |
| `fps` / `frameRate` | number | 仅接受 16/24/30，否则 ffprobe 探测 |

处理：
- 校验 `src` 防穿越，`resolve_local_virtual_path` 映射到磁盘（缺失 → 404）。
- 输出到 `OUTPUT_DIR/CutVideo/cut_<时间戳ms>_<随机100-999>.mp4`。
- **ffmpeg 命令（重新编码，非 stream-copy，所以帧精确）：**

```bash
ffmpeg -y -i <src> -ss <start> -t <end-start> \
       -c:v libx264 -preset fast -c:a aac [-r <fps>] <out>
```

  - `-ss` 放在 `-i` **之后**（输入相对、精确慢速 seek），用 `-t`（时长 = end-start）而非 `-to`。
  - 永远重编码，无 `-c copy`。`-r <fps>` 仅在已知 fps 时插入。
  - `subprocess.communicate(timeout=120)`，超时 kill。

返回：

```json
{ "success": true, "filename": "cut_xxx.mp4",
  "path": "output/CutVideo/xxx.mp4",
  "localPath": "output/CutVideo/xxx.mp4",
  "url": "/output/CutVideo/xxx.mp4", "fps": 24 }
```

错误：400（参数/src 非法）、404（源不存在）、500（FFmpeg 失败）、504（超时）。

### 取消 / 退出

点 ✕、点裁剪条外部（document pointerdown）、按 Esc 都触发 `exit()`，恢复隐藏覆盖层、移除监听、移除 DOM、清模式类。

## 十、智能剪辑（自动多段）

### 设置面板 `.v2-video-clip-smartpanel`

点「智能剪辑」弹出（绝对定位在按钮上方，圆角卡片，`min-width:260px`，点外部关闭）：

- **模式**：稳 `stable` / 均衡 `balanced` / 敏感 `sensitive`（三选一按钮组 `.v2-video-clip-modebtn`，默认稳）。
  - 提示：稳=适合口播/影视、结果更干净；均衡=更容易切出更多镜头；敏感=适合快剪/混剪。
- **帧率**：16 / 24 / 30 帧（`.v2-video-clip-fpsbtn`，默认 24）。
  - 提示：16 帧更省时，24 帧更通用，30 帧更顺滑但处理更慢。
- **最多生成段数**：可拖可输入的 stepper（`.v2-video-clip-maxseg`），范围 **2–25**（默认 20）。
  - 按住数字左右拖动调整（**每 6px = 1 段**）；点击则变 `<input type=number>`，Enter/blur 提交、Esc 取消；方向键也可 ±1。
  - 提示：最多生成 25 段，避免镜头太碎导致画布一次出现大量节点。
- **底部提示**：镜头很碎时会自动降级，保证能生成结果。
- **按钮**：取消 / 开始（`.v2-video-clip-panelbtn` / `.primary`）。

### 前端调用流程

点「开始」：

```json
POST /api/v2/video/smart_clip
{ "src": "...", "options": { "mode": "stable", "maxSegments": 20, "fps": 24 } }
→ { "success": true, "jobId": "smartclip_..." }
```

然后**轮询**（每 **800ms**，单次请求超时 20s，无总超时，退出模式即中止）：

```
GET /api/v2/video/smart_clip/status?jobId=...
→ { status: running|done|error,
    stage: queued|detect|cut|done,
    progress: 0~1, doneCount, total, segments, error }
```

按钮上实时显示阶段（detect→分析中 / cut→裁剪中）和 `已完成/总数 (百分比)`。
完成后，**为每段生成一个 `source-video` 节点**（名「智能剪辑 N」，自动避让摆放），全部选中、聚焦、保存，toast「✅ 智能剪辑完成，已生成 N 段」。空结果时提示「未检测到场景变化」。

### 后端 `_run_smart_clip_job`（异步线程）

- 任务存内存字典 `_smart_clip_jobs`（`threading.Lock` 保护），2 小时后清理。
- 依赖 `scenedetect` + `opencv-python`（缺则报错提示装依赖）。
- 状态机：`status ∈ running|done|error`；`stage ∈ queued|detect|cut|done|import|error`；`progress` 为 0.0~1.0 浮点。**注意后端用英文状态，中文文案只在前端**。

处理步骤：

1. **ffprobe 取时长**。
2. **场景检测**：PySceneDetect 的 `ContentDetector`（**不是** ffmpeg 的 select/scdet），三档 threshold —— 稳 27 / 均衡 23 / 敏感 18（越低越敏感），配合 `min_scene_len`（= `min_scene_sec * fps` 帧）。
3. **黑场检测**：OpenCV (`cv2.VideoCapture`) 采样帧（≤900s 用 2fps，否则 1fps）算平均亮度，亮度 ≤16 且持续 ≥0.5s 视为切点/丢弃段，边界留 0.15s 余量。
4. **自动降级链**：稳→均衡→敏感依次尝试，第一个能切出 ≥2 段就停（对应"镜头很碎时自动降级"）。请求模式决定**起始档**和能降级到哪。
5. **后处理**：合并内容边界 + 黑场边界、按 `debounce_sec` 去抖、丢过短段、`_merge_to_limit` 把最短段并入邻居直到 ≤ maxSegments；仍 ≤1 段则等分兜底（`desired = clamp(round(duration/3), 2, maxSegments)`）。
6. **逐段 ffmpeg 裁剪**（同 cut 的 libx264/aac 重编码，每段 `communicate(timeout=300)`），输出到 `OUTPUT_DIR/SceneCuts/<jobId>/scene_001_<ms起>-<ms止>.mp4`；进度 `0.05 + 0.95*(idx+1)/total`。

各档 profile：

```python
profiles = {
  "stable":    {"threshold": 27.0, "min_scene_sec": 1.0,  "debounce_sec": 0.3, "strip_black": True},
  "balanced":  {"threshold": 23.0, "min_scene_sec": 0.6,  "debounce_sec": 0.2, "strip_black": True},
  "sensitive": {"threshold": 18.0, "min_scene_sec": 0.25, "debounce_sec": 0.1, "strip_black": False},
}
```

`segments` 数组每项：

```json
{ "index": 1, "start": 0.0, "end": 5.23, "duration": 5.23, "fps": 24,
  "path": "output/SceneCuts/<jobId>/scene_001_0-5230.mp4",
  "localPath": "...", "url": "/output/SceneCuts/<jobId>/scene_001_0-5230.mp4" }
```

---

## 十一、提取视频帧（附带功能）

「提取视频帧」圆按钮调 `extractCurrentVideoFrameToImageNode({videoEl, anchorNodeId, fallbackDurationSec, logPrefix})`，把当前播放帧画到 canvas，生成一个 `source-image` 节点（名「截取第N帧」）放在原节点旁，异步保存 blob 到本地。

## 十二、路径解析与静态服务

- 输出根目录 `OUTPUT_DIR`（默认 `<项目>/output`，可用 `AIC_OUTPUT_DIR` 覆盖）。
- 裁剪文件在 `OUTPUT_DIR/CutVideo/`，智能剪辑在 `OUTPUT_DIR/SceneCuts/<jobId>/`。
- 返回的 `url`（如 `/output/CutVideo/...`）由 `translate_path` → `resolve_local_virtual_path` 映射回磁盘并提供静态访问，含 `_is_path_inside` 容器校验防穿越。
- 还支持 `data/uploads/...`、`data/assets/...` 前缀；其它一律拒绝。

### 鉴权

无按用户鉴权。唯一门禁 `_enforce_local_api_access`：`/api/v2/video` 属敏感前缀，要求本地 token / 合法 Origin / loopback 之一，否则 403。

---

## 十三、移植到其它项目的清单

要在别的项目装上这个功能，需要这几块：

### 1. 后端（Python + ffmpeg）

- `POST /api/v2/video/cut`：收 `{src, start, end, fps}`，跑 `ffmpeg -i -ss -t -c:v libx264 -c:a aac -r`，返回新文件 `url`/`localPath`。
- 可选 `smart_clip` + `status`：需 `pip install scenedetect opencv-python`，异步线程跑场景检测+黑场+ffmpeg 切段，轮询返回进度和段列表。
- 一个虚拟路径解析（把 `output/...` 映射到磁盘并防穿越）+ 把 output 目录作为静态资源服务。

### 2. 前端控制器

一个单例，管：
- `init/exit` 生命周期 + "聚光灯"模式类切换。
- 注入裁剪条 DOM、拖动/键盘/滚轮交互。
- 像素↔时间换算（最小 0.1s、默认 3s、30fps 步进）。
- `requestAnimationFrame` 播放头循环（区间循环播放）。
- 缩略图离屏渲染。
- 确认后调后端并 `addNode` 生成新节点。

### 3. CSS

`v2-video-clip*` 全套样式 + `is-video-clip-mode` / `is-video-clip-target` / `is-video-clipping` 模式类。两个关键技巧：
- `scale(var(--zoom-inv))` 抵消画布缩放。
- `box-shadow:0 0 0 9999px <色>` 做选区外遮罩。

### 4. 需宿主项目提供的钩子（移植时替换成你项目对应 API）

`showToast`、`v2FocusOnNode/v2FocusOnNodes`、状态库的 `addNode/setSelectedNodes/commit`、`localPathToUrl`、节点摆放工具（`calcSafeSpawnPosNearNode`）、本地缓存保存。

---

## 十四、关键数字速查

| 项 | 值 |
|---|---|
| 缩略图 | 10 张 / 高 44px / JPEG 质量 0.7 |
| 视频元数据超时 | 1500ms |
| 缩略图 seek 回退超时 | 450ms |
| 最小选区 | 0.1s |
| 默认 / 双击重置选区长度 | 3s |
| 边缘命中范围 | 20px |
| 双击忽略边缘范围 | 24px |
| 键盘 / 滚轮步进帧率 | 30fps（Shift = 10 帧） |
| 智能剪辑段数 | 2–25（默认 20） |
| 段数拖动灵敏度 | 6px / 段 |
| 智能剪辑轮询间隔 | 800ms |
| 智能剪辑单次状态请求超时 | 20s |
| 后端裁剪超时 | 120s |
| 智能剪辑每段裁剪超时 | 300s |
| 场景检测 threshold | 稳 27 / 均衡 23 / 敏感 18 |
| 任务清理 | 2 小时 |
| 智能剪辑帧率选项 | 16 / 24 / 30（默认 24） |

---

## 十五、相关文件索引

| 文件 | 作用 |
|---|---|
| `src/modules/VideoClipController.js` | 前端核心控制器（单例） |
| `src/components/nodeToolbar/videoActions/clipAction.js` | 「裁剪视频」工具栏按钮绑定 |
| `src/components/nodeToolbar/videoToolbarHtml.js` | 工具栏按钮 HTML（`.act-clip`，标签「裁剪视频」） |
| `src/components/media-clip/mediaClipState.js` | 多轨剪辑状态（独立于本功能） |
| `src/components/videoFrameCapture.js` / `videoFrameExtraction.js` | 帧提取/缩略图辅助 |
| `server.py` | `smart_clip` 接口 + `_run_smart_clip_job` 异步任务 |
| `backend/services/local_media_processing_route_service.py` | `_handle_video_cut` 裁剪接口 |
| `backend/services/http_route_dispatcher.py` | 路由分发 + `smart_clip/status` |
| `backend/services/media_file_route_service.py` | 虚拟路径解析 |
| `style.css` | `v2-video-clip*` 与模式类样式 |


