# Midjourney Slider Native Drag Design

## Problem

The three Midjourney settings sliders visibly jitter while dragging. The settings panel itself remains stationary, so ReactFlow node movement is not the source of the issue.

All three sliders share custom pointer handling that calls `setPointerCapture` on pointer down, releases it on pointer up, and treats `pointercancel` as a normal pointer-up commit. Native `input[type="range"]` already owns its drag interaction. The additional capture lifecycle competes with that native behavior and produces unstable thumb and value updates.

## Goal

Make the Stylize, Weird, and Chaos sliders track the pointer smoothly while preserving the existing Midjourney settings behavior.

## Interaction Contract

- Use the browser's native range drag behavior.
- On pointer down, stop propagation to ReactFlow and mark the slider as dragging.
- During dragging, update only the panel's local draft value.
- On pointer up, end dragging and persist the final draft value once.
- On pointer cancel, end the drag and restore the last committed `value`. Do not treat cancellation as a successful commit.
- Do not call `setPointerCapture`, `releasePointerCapture`, or `hasPointerCapture`.
- Keep preset buttons, quality controls, value ranges, steps, labels, and visual styling unchanged.

## Data Flow

`MidjourneySettingsPanel` remains the owner of the temporary drag value through `draftSettings` and `draftSettingsRef`. The parent `value` prop continues to synchronize into the draft only while no slider is being dragged. A completed pointer-up sends one `onChange` call with the final settings object.

No changes are required in `ImageGenerationNode`, the canvas store, persistence, API request mapping, or Midjourney generation code.

## Failure Handling

A cancelled pointer sequence clears the local dragging flag and restores the last committed parent value. It does not persist or continue displaying a potentially incomplete interaction.

## Testing

- Add a regression source-contract test requiring separate pointer-up and pointer-cancel handlers.
- Assert that the component does not contain manual pointer capture or release calls.
- Keep existing assertions for local draft state, ReactFlow gesture blocking, ranges, steps, presets, and persistence wiring.
- Run the focused Midjourney settings tests and TypeScript checking.
- Verify the live development page after implementation.

## Scope

Only `MidjourneySettingsPanel.tsx` and its focused test should change during implementation. Do not modify unrelated sliders or canvas behavior.
