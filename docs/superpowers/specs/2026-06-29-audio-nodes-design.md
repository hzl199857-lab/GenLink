# Audio Nodes Design

## Context

GenLink uses a ReactFlow infinite canvas in `src/components/canvas/InfiniteCanvas.tsx`.
The canvas already supports text, image generation, uploaded images, uploaded videos,
video generation, video upscale, storyboard, and panorama nodes.

The add-node menu already contains an `audio` action in the generation section, and
the hidden upload input already accepts `audio/*`. However, global upload currently
creates image and video nodes only. Audio files are only accepted as inline reference
media for `video_generation` nodes through the existing `referenceAudio` data field.

This feature adds first-class canvas support for:

- Uploaded audio resource nodes created from audio file upload or drag and drop.
- Audio generation nodes that reserve the frontend surface for future RunningHub API
  integration.

## Goals

- Let uploaded audio files become visible, playable canvas nodes.
- Match the existing visual language of uploaded image, uploaded video, image
  generation, and video generation nodes.
- Render a real audio waveform from the uploaded/generated audio source.
- Let audio nodes connect to video generation and audio generation nodes as reference
  audio inputs.
- Add an audio generation node from the existing add-node menu `audio` action.
- Keep the audio generation run action disabled until the RunningHub audio API
  workflow is implemented.
- Save and restore audio node data in project snapshots.
- Avoid expanding audio into the material library or generation history in this phase.

## Non-Goals

- No real RunningHub audio generation request is sent in this phase.
- No fake generated audio result is created.
- No audio material library, audio history, or reusable audio asset browser is added.
- No waveform editing, trimming, mixing, or timeline arrangement is added.
- No transcription, beat detection, BPM detection, or audio analysis beyond waveform
  rendering is added.
- No new global API settings panel is required beyond storing node-level RunningHub
  placeholder fields.

## Node Types

Add two `NodeType` values in `src/types/canvas.ts`:

- `audio`
- `audio_generation`

### `AudioNodeData`

The uploaded audio node stores:

- `title?: string`
- `audioUrl: string`
- `hostedAudioUrl?: string`
- `previewUrl?: string`
- `fileName?: string`
- `outputFileName?: string`
- `mimeType?: string`
- `sizeBytes?: number`
- `durationSeconds?: number`
- `status?: "idle" | "generating" | "error"`
- `statusMessage?: string`
- `errorMessage?: string`

`audioUrl` is the local preview or hosted URL used for playback. `hostedAudioUrl`
is preferred when available. `status: "generating"` is reused for upload-in-progress
to match existing media node behavior.

### `AudioGenerationNodeData`

The audio generation node stores:

- `title?: string`
- `prompt?: string`
- `provider?: "runninghub"`
- `runningHubWorkflowId?: string`
- `taskType?: "general" | "voiceover" | "music" | "sound-effect"`
- `duration?: number`
- `style?: string`
- `voice?: string`
- `referenceAudio?: VideoGenerationMediaReference[]`
- `audioUrl?: string`
- `hostedAudioUrl?: string`
- `generatedOutputFileName?: string`
- `generatedModel?: string`
- `generatedAt?: string`
- `durationSeconds?: number`
- `mimeType?: string`
- `sizeBytes?: number`
- `status?: "idle" | "generating" | "error"`
- `errorMessage?: string`

The `referenceAudio` item type should reuse `VideoGenerationMediaReference` because
the project already uses it for image, video, and audio reference uploads. This keeps
upload status, hosted URL, file name, mime type, size, and duration fields consistent.

## Uploaded Audio Node UX

Create `src/components/nodes/UploadedAudioNode.tsx`.

The component follows the shape of `UploadedVideoNode`:

- A visible title row above the card.
- `Volume2` or `Music` icon from `lucide-react`.
- Editable title using `EditableNodeTitle`.
- A dark rounded card with selected and uploading states matching existing nodes.
- Left target and right source `CardSideHandle`.
- Hover toolbar actions:
  - Replace audio file.
  - Download audio.
  - Copy audio link.

The card content is a compact waveform player:

- Real waveform.
- Play and pause button.
- Current time and total duration.
- Click or drag on waveform to seek.
- Uploading and error overlays following `UploadedVideoNode` styling.

The node should use a stable default width similar to uploaded video cards, about
`420px`, with a compact fixed height around `150px` to `180px`. It should not resize
based on filename length or duration text.

## Audio Waveform Player

Create `src/components/nodes/AudioWaveformPlayer.tsx`.

Responsibilities:

- Load and play audio using an `HTMLAudioElement`.
- Decode the source with Web Audio API and render a real waveform.
- Downsample peaks into a stable bar or line visualization.
- Keep waveform rendering independent from ReactFlow node sizing.
- Support click and pointer drag seeking.
- Update progress during playback.
- Expose `onLoadedMetadata(durationSeconds)` so node data can persist duration.

Failure handling:

- If metadata loads but waveform decoding fails, playback should still work.
- If both playback and decoding fail, show a concise error state.
- CORS or decoding failures should not crash the canvas.

The waveform should be cached by source URL inside the component module to avoid
decoding the same audio repeatedly when React remounts nodes.

## Audio Generation Node UX

Create `src/components/nodes/AudioGenerationNode.tsx` and
`src/components/nodes/AudioGenerationPromptBar.tsx`.

The generation node follows the video generation layout:

- A fixed node stage for visual alignment.
- A title row with audio icon and editable title.
- A top result card.
- A bottom `NodeToolbar` prompt bar.
- Left target and right source handles.

Result card behavior:

- Empty state shows a muted audio icon.
- If `audioUrl` or `hostedAudioUrl` exists, show `AudioWaveformPlayer`.
- If `status === "error"`, show the error message in the card.
- During future generation, use the same glowing running style as image/video nodes.

Prompt bar behavior:

- Text input for a general audio prompt.
- Reference media strip that can display connected reference audio.
- RunningHub provider shown as the selected provider.
- Workflow ID field stored in node data.
- Task type selector:
  - General
  - Voiceover
  - Music
  - Sound effect
- Duration selector/input.
- Optional style and voice text fields.
- Run button visible but disabled.
- Disabled run tooltip or inline hint says RunningHub audio workflow is not connected
  yet.

No fake results should be produced when the disabled run button is clicked.

## Reference Audio

Add audio support to the existing reference flow.

### Source Nodes

An `audio` node can provide a reference audio source when it has a non-empty
`hostedAudioUrl` or `audioUrl`.

An `audio_generation` node can provide a reference audio source when it has a
non-empty `hostedAudioUrl` or `audioUrl`.

### Target Nodes

When an audio source connects to a `video_generation` node, it is added to that
node's existing `referenceAudio` list.

When an audio source connects to an `audio_generation` node, it is added to that
node's `referenceAudio` list.

The connection should still create the visible edge. Duplicate references should be
deduped by node id and URL, following the existing image/video reference behavior.

### Reference Media Strip

Extend `ReferenceMediaStrip` to support audio thumbnails in addition to image and
video thumbnails. The audio thumbnail should be a compact square with an audio icon
or tiny static waveform, upload/error overlays, index badge, and remove button.

The video generation prompt bar can continue to pass images and videos as before,
but it should also pass audio references so users can see and remove reference audio.
The audio generation prompt bar should use the same strip with audio-focused labels.

## Upload and Drag-Drop

Global upload and canvas drop should split selected files into:

- image files
- video files
- audio files

Images and videos keep their current behavior.

Audio files create `audio` nodes with pending upload status, local object URLs for
immediate playback, and OSS-hosted URLs when upload completes. Use the existing
`uploadMediaFileToOss` helper because it already routes `audio/*` files into the
`references/audio` folder.

Audio import positioning should follow the existing grid pattern used for images and
videos, stacking below any imported images and videos from the same upload action.

Replacing an uploaded audio node should:

- Create a new local object URL.
- Upload the new file through the existing media upload helper.
- Update the same node's data.
- Revoke the old local object URL when it is no longer needed.

## Store Changes

Extend `src/store/canvas-store.ts` with:

- `createAudioNodeData()`
- `createAudioGenerationNodeData()`
- `createNode("audio", position)`
- `createNode("audio_generation", position)`
- audio node normalization during project load
- connected audio helpers for video generation and audio generation
- reference add/remove/update logic for `audio_generation`
- source reference conversion for `audio` and `audio_generation`

Existing `addReferenceMediaToVideoGenerationNode` can keep using
`VideoGenerationMediaReference[]`; it should receive audio references from node
connections and uploads.

## Canvas Integration

Update `InfiniteCanvas.tsx`:

- Import and register `UploadedAudioNode` and `AudioGenerationNode`.
- Add `audio` and `audio_generation` entries to `nodeTypes`.
- Route `AddNodeMenu` action `audio` to `addNodeAtCenter("audio_generation", ...)`.
- Support `audio_generation` in connection-menu creation if a connection starts from
  a compatible source.
- Add global upload and drag-drop creation for audio files.
- Add audio node bounds estimation for selection, grouping, and layout.
- Add audio info popover support only if it can reuse the existing info popover shape
  cleanly; otherwise leave info popover out for this phase.
- Keep material library and generation history unchanged.

## API Placeholder

No `/api/ai/audio` endpoint is required for this phase.

The UI should make the future integration explicit by storing RunningHub fields on
the node and disabling the run action. The implementation should avoid hard-coding
temporary fake API calls so future RunningHub integration can add the endpoint and
store action without deleting mock behavior.

When the real integration is added later, expected flow is:

1. Validate RunningHub workflow ID and API key.
2. Submit prompt, task type, duration, style, voice, and reference audio.
3. Poll for completion if RunningHub uses async tasks.
4. Store result URL, hosted URL, output file name, duration, size, model, and generated
   timestamp in `AudioGenerationNodeData`.
5. Let the result act as a source audio reference to downstream nodes.

## Persistence

Project snapshots should include both new node types through the existing
`CanvasNode`, `CanvasNodeData`, and project storage flow.

For local preview URLs, follow the same project hydration conventions already used
for image and video media. Hosted URLs should be preferred for durable playback.

## Accessibility and Interaction

- Buttons need clear `aria-label` text.
- Waveform seeking should work with pointer input.
- Playback controls should not trigger node drag.
- Prompt bar inputs and menus should use `nodrag nopan` where needed.
- Disabled run controls should be visibly disabled and explain why through tooltip
  or nearby hint text.

## Testing

Focused automated coverage should include:

- Type/model tests for creating and normalizing audio nodes.
- Upload splitting tests if the existing upload logic is factored enough to test.
- Reference dedupe and connection tests for audio sources to video/audio generation.
- `ReferenceMediaStrip` rendering for audio references and removal behavior.
- Waveform player fallback behavior can be covered with component-level tests if the
  project test setup supports DOM audio mocking; otherwise verify manually.

Manual verification:

- Upload one audio file from toolbar upload.
- Drag one audio file onto blank canvas.
- Upload mixed image, video, and audio files and verify placement.
- Replace an uploaded audio file.
- Play, pause, and seek in the waveform.
- Copy link and download audio from the uploaded audio node.
- Add an audio generation node from the add-node menu.
- Verify run is disabled and shows the RunningHub placeholder message.
- Connect uploaded audio to video generation and confirm it appears as reference
  audio.
- Connect uploaded audio to audio generation and confirm it appears as reference
  audio.
- Save and reload a project with both audio node types.

## Open Implementation Notes

- Reuse existing dark panel colors, `rounded-gl-*`, `shadow-gl-*`, `CardSideHandle`,
  `EditableNodeTitle`, and prompt bar patterns. Do not introduce a separate visual
  system for audio.
- Keep the first implementation scoped to audio resources and RunningHub placeholders.
- Prefer extending existing media reference helpers over creating parallel audio-only
  paths unless the existing helper boundaries become unclear during implementation.
