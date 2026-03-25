-- CreateTable
CREATE TABLE "ImaiJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "endpoint" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "imageUrl" TEXT,
    "result" TEXT,
    "error" TEXT,
    "webhookDelivered" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ImaiJob_jobId_key" ON "ImaiJob"("jobId");

-- CreateIndex
CREATE INDEX "ImaiJob_jobId_idx" ON "ImaiJob"("jobId");

-- CreateIndex
CREATE INDEX "ImaiJob_shop_status_idx" ON "ImaiJob"("shop", "status");
