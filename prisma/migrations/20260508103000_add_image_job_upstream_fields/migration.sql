ALTER TABLE "ImageJob" ADD COLUMN "provider" TEXT;
ALTER TABLE "ImageJob" ADD COLUMN "upstreamTaskId" TEXT;

CREATE INDEX "ImageJob_upstreamTaskId_idx" ON "ImageJob"("upstreamTaskId");
