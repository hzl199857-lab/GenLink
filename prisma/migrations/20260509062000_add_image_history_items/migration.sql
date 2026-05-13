CREATE TABLE "ImageHistoryItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "imageJobId" TEXT,
  "resultIndex" INTEGER,
  "imageUrl" TEXT NOT NULL,
  "hostedImageUrl" TEXT,
  "model" TEXT,
  "width" INTEGER,
  "height" INTEGER,
  "format" TEXT,
  "sizeBytes" INTEGER,
  "generatedAt" DATETIME NOT NULL,
  "nodeData" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "ImageJob" ADD COLUMN "historyNodeData" TEXT;

CREATE INDEX "ImageHistoryItem_generatedAt_idx" ON "ImageHistoryItem"("generatedAt");
