-- CreateTable
CREATE TABLE "ShopBillingState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "activePlanSlug" TEXT NOT NULL DEFAULT 'free',
    "activePlanName" TEXT,
    "subscriptionId" TEXT,
    "subscriptionStatus" TEXT NOT NULL DEFAULT 'FREE',
    "currentPeriodEnd" DATETIME,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BillingCreditAllocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "grantKey" TEXT NOT NULL,
    "planSlug" TEXT NOT NULL,
    "planName" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "periodEnd" DATETIME,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "source" TEXT,
    "responseJson" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopBillingState_shop_key" ON "ShopBillingState"("shop");

-- CreateIndex
CREATE INDEX "ShopBillingState_subscriptionId_idx" ON "ShopBillingState"("subscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingCreditAllocation_grantKey_key" ON "BillingCreditAllocation"("grantKey");

-- CreateIndex
CREATE INDEX "BillingCreditAllocation_shop_createdAt_idx" ON "BillingCreditAllocation"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "BillingCreditAllocation_shop_subscriptionId_idx" ON "BillingCreditAllocation"("shop", "subscriptionId");
