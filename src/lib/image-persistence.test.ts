import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertPersistableImageReferences,
  withStableHostedImage,
} from "./image-persistence.ts";

test("replaces inline image data with its stable hosted URL", () => {
  const result = withStableHostedImage(
    {
      imageUrl: "data:image/png;base64,aW1hZ2U=",
      hostedImageUrl: undefined,
      model: "test-model",
    },
    "https://img.example.com/generated/image.png",
  );

  assert.equal(result.imageUrl, "https://img.example.com/generated/image.png");
  assert.equal(result.hostedImageUrl, result.imageUrl);
  assert.equal(result.model, "test-model");
});

test("rejects transient URLs before image results are persisted", () => {
  assert.throws(
    () =>
      assertPersistableImageReferences([
        { imageUrl: "data:image/png;base64,aW1hZ2U=" },
      ]),
    /transient URL/,
  );
  assert.throws(
    () =>
      assertPersistableImageReferences([
        { imageUrl: "blob:browser-preview" },
      ]),
    /transient URL/,
  );
});

test("accepts hosted and server-managed image URLs", () => {
  assert.doesNotThrow(() =>
    assertPersistableImageReferences([
      {
        imageUrl: "https://img.example.com/generated/image.png",
        hostedImageUrl: "https://img.example.com/generated/image.png",
      },
      {
        imageUrl: "/api/local-images/generated-image.png",
        hostedImageUrl: "/api/local-images/generated-image.png",
      },
    ]),
  );
});
