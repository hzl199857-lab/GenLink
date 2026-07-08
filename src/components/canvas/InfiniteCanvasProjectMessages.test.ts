import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(
  new URL("./InfiniteCanvas.tsx", import.meta.url),
  "utf8",
);

test("canvas bottom project messages use Simplified Chinese copy", () => {
  const forbiddenMessages = [
    "Select an image node to connect",
    "Current node has no image for the material library",
    "Please select an image file",
    "Compose failed",
    "Agent nodes created",
    "Agent returned no nodes",
    "No image generation nodes selected",
    "image generation jobs failed",
    "Image generation started",
    "No source nodes found",
    "No new connections added",
    "Material already exists",
    "Added to material library",
    "Material moved",
    "Image is unavailable",
    "Video is not ready",
    "No video is available for upscale",
    "3D view generation failed",
    "extract video frame failed",
    "split image failed",
    "Create panorama screenshot failed",
    "Connect failed",
    "Upload text reference failed",
    "Upload storyboard reference failed",
    "Upload video reference failed",
    "Import failed",
    "Crop failed",
    "No layoutable nodes in group",
    "No project is currently open",
    "Project saved",
    "Renamed successfully",
    "Rename failed",
    "Select folder failed",
    "Project folder cleared",
    "Update project folder failed",
    "Project deleted",
    "Delete failed",
  ];

  for (const message of forbiddenMessages) {
    assert.doesNotMatch(source, new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
