import { BillingInterval } from "@shopify/shopify-app-react-router/server";
import type {
  AppSubscription,
  BillingConfigRecurringLineItem,
  BillingCheckResponseObject,
} from "@shopify/shopify-api";
import prisma from "../db.server";
import { decrypt } from "./encryption.server";
import {
  FREE_PLAN,
  STARTER_ANNUAL_PLAN,
  STARTER_MONTHLY_PLAN,
  PRO_ANNUAL_PLAN,
  PRO_MONTHLY_PLAN,
  PAID_PLANS,
  PAID_PLAN_NAMES,
  ULTRA_ANNUAL_PLAN,
  ULTRA_MONTHLY_PLAN,
  getPaidPlanByBillingName,
} from "./billing/plans";

const CREDIT_ALLOCATION_RETRY_WINDOW_MS = 15 * 60 * 1000;

export const BILLING_TEST_MODE =
  process.env.SHOPIFY_BILLING_TEST_MODE === "true" ||
  (process.env.NODE_ENV !== "production" &&
    process.env.SHOPIFY_BILLING_TEST_MODE !== "false");

const STARTER_LINE_ITEM: BillingConfigRecurringLineItem = {
  amount: 20,
  currencyCode: "USD",
  interval: BillingInterval.Every30Days,
};

const STARTER_ANNUAL_LINE_ITEM: BillingConfigRecurringLineItem = {
  amount: 240,
  currencyCode: "USD",
  interval: BillingInterval.Annual,
};

const PRO_LINE_ITEM: BillingConfigRecurringLineItem = {
  amount: 100,
  currencyCode: "USD",
  interval: BillingInterval.Every30Days,
};

const PRO_ANNUAL_LINE_ITEM: BillingConfigRecurringLineItem = {
  amount: 1200,
  currencyCode: "USD",
  interval: BillingInterval.Annual,
};

const ULTRA_LINE_ITEM: BillingConfigRecurringLineItem = {
  amount: 200,
  currencyCode: "USD",
  interval: BillingInterval.Every30Days,
};

const ULTRA_ANNUAL_LINE_ITEM: BillingConfigRecurringLineItem = {
  amount: 2400,
  currencyCode: "USD",
  interval: BillingInterval.Annual,
};

export const SHOPIFY_BILLING_CONFIG = {
  [STARTER_MONTHLY_PLAN]: {
    lineItems: [STARTER_LINE_ITEM],
  },
  [STARTER_ANNUAL_PLAN]: {
    lineItems: [STARTER_ANNUAL_LINE_ITEM],
  },
  [PRO_MONTHLY_PLAN]: {
    lineItems: [PRO_LINE_ITEM],
  },
  [PRO_ANNUAL_PLAN]: {
    lineItems: [PRO_ANNUAL_LINE_ITEM],
  },
  [ULTRA_MONTHLY_PLAN]: {
    lineItems: [ULTRA_LINE_ITEM],
  },
  [ULTRA_ANNUAL_PLAN]: {
    lineItems: [ULTRA_ANNUAL_LINE_ITEM],
  },
};

type BillingContextLike = {
  check: unknown;
};

type CreditAllocationResult =
  | {
      state: "not-applicable";
      message: string;
    }
  | {
      state: "granted";
      alreadyGranted: boolean;
      grantKey: string;
      message: string;
    }
  | {
      state: "failed";
      grantKey: string;
      message: string;
    };

export type SyncedBillingState = {
  activePlan:
    | (typeof FREE_PLAN)
    | (typeof PAID_PLANS)[number];
  activeSubscription: AppSubscription | null;
  creditAllocation: CreditAllocationResult;
};

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getNewestActiveSubscription(
  subscriptions: AppSubscription[],
): AppSubscription | null {
  return (
    [...subscriptions]
      .sort(
        (left, right) =>
          new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
      )
      .find((subscription) => !!getPaidPlanByBillingName(subscription.name)) ??
    null
  );
}

function getGrantKey(shop: string, subscription: AppSubscription): string {
  return [
    shop,
    subscription.id,
    subscription.currentPeriodEnd || "no-period-end",
  ].join(":");
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function getGrantWindows(params: {
  shop: string;
  subscription: AppSubscription;
}) {
  const startDate = toDate(params.subscription.createdAt);
  const periodEnd = toDate(params.subscription.currentPeriodEnd);
  if (!startDate || !periodEnd) return [];

  const now = new Date();
  const limit = now.getTime() < periodEnd.getTime() ? now : periodEnd;
  const windows: Array<{
    grantKey: string;
    windowStart: Date;
    windowEnd: Date;
  }> = [];

  for (let index = 0; index < 120; index += 1) {
    const windowStart = addMonths(startDate, index);
    if (windowStart.getTime() > limit.getTime()) break;
    if (windowStart.getTime() >= periodEnd.getTime()) break;

    const naturalEnd = addMonths(startDate, index + 1);
    const windowEnd =
      naturalEnd.getTime() > periodEnd.getTime() ? periodEnd : naturalEnd;

    windows.push({
      grantKey: [params.shop, params.subscription.id, windowStart.toISOString()].join(
        ":",
      ),
      windowStart,
      windowEnd,
    });

    if (windowEnd.getTime() >= periodEnd.getTime()) break;
  }

  return windows;
}

function getRequestErrorMessage(
  status: number,
  body: Record<string, unknown> | null,
  rawBody: string,
) {
  if (typeof body?.message === "string") return body.message;
  if (typeof body?.error === "string") return body.error;
  if (rawBody) return rawBody.slice(0, 400);
  return `IMAI billing sync failed with status ${status}.`;
}

async function allocateCreditsToImai(params: {
  shop: string;
  imaiApiKey: string;
  plan: (typeof PAID_PLANS)[number];
  subscription: AppSubscription;
  grantKey: string;
  windowStart: Date;
  windowEnd: Date;
}) {
  const endpoint = process.env.IMAI_BILLING_SYNC_URL;
  if (!endpoint) {
    return {
      ok: false,
      message:
        "IMAI_BILLING_SYNC_URL is not configured yet, so paid Shopify plans cannot grant monthly IMAI credits.",
      responseJson: null,
    };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.imaiApiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": params.grantKey,
    },
    body: JSON.stringify({
      provider: "shopify",
      shop: params.shop,
      planSlug: params.plan.slug,
      planName: params.plan.billingName,
      planTier: params.plan.name,
      billingInterval: params.plan.billingInterval.toUpperCase(),
      grantCredits: params.plan.creditsPerMonth,
      creditsPerMonth: params.plan.creditsPerMonth,
      billingAmount: params.plan.priceAmount,
      currencyCode: "USD",
      subscriptionId: params.subscription.id,
      subscriptionStatus: params.subscription.status,
      subscriptionCreatedAt: params.subscription.createdAt,
      currentPeriodEnd: params.subscription.currentPeriodEnd,
      grantWindowStart: params.windowStart.toISOString(),
      grantWindowEnd: params.windowEnd.toISOString(),
      isTest: params.subscription.test,
      grantKey: params.grantKey,
      source: "shopify-app",
    }),
  });

  const rawBody = await response.text();
  let parsedBody: Record<string, unknown> | null = null;

  try {
    parsedBody = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : null;
  } catch {
    parsedBody = null;
  }

  if (!response.ok) {
    return {
      ok: false,
      message: getRequestErrorMessage(response.status, parsedBody, rawBody),
      responseJson: parsedBody ?? (rawBody ? { rawBody } : null),
    };
  }

  return {
    ok: true,
    message:
      typeof parsedBody?.message === "string"
        ? parsedBody.message
        : `Granted ${params.plan.creditsPerMonth} IMAI credits for ${params.plan.name}.`,
    responseJson: parsedBody ?? (rawBody ? { rawBody } : null),
  };
}

async function ensureCreditsAllocated(params: {
  shop: string;
  imaiApiKey: string;
  plan: (typeof PAID_PLANS)[number];
  subscription: AppSubscription;
}): Promise<CreditAllocationResult> {
  const grantWindows = getGrantWindows({
    shop: params.shop,
    subscription: params.subscription,
  });

  if (!grantWindows.length) {
    return {
      state: "not-applicable",
      message: "No credit grant window is due yet for the active subscription.",
    };
  }

  let processedGrantKey = getGrantKey(params.shop, params.subscription);
  let newGrants = 0;
  let alreadyGrantedCount = 0;

  for (const grantWindow of grantWindows) {
    processedGrantKey = grantWindow.grantKey;
    const existingGrant = await prisma.billingCreditAllocation.findUnique({
      where: { grantKey: grantWindow.grantKey },
    });

    if (existingGrant?.status === "granted") {
      alreadyGrantedCount += 1;
      continue;
    }

    if (
      existingGrant &&
      existingGrant.status !== "granted" &&
      Date.now() - existingGrant.updatedAt.getTime() <
        CREDIT_ALLOCATION_RETRY_WINDOW_MS
    ) {
      return {
        state: "failed",
        grantKey: grantWindow.grantKey,
        message:
          existingGrant.error ??
          "The last IMAI credit sync failed recently. Waiting before retrying.",
      };
    }

    await prisma.billingCreditAllocation.upsert({
      where: { grantKey: grantWindow.grantKey },
      update: {
        status: "pending",
        error: null,
        responseJson: null,
        source: "shopify-billing-sync",
        periodEnd: grantWindow.windowEnd,
        planSlug: params.plan.slug,
        planName: params.plan.billingName,
        credits: params.plan.creditsPerMonth,
        amountCents: params.plan.priceAmount * 100,
        currencyCode: "USD",
        subscriptionId: params.subscription.id,
        isTest: params.subscription.test,
      },
      create: {
        shop: params.shop,
        grantKey: grantWindow.grantKey,
        planSlug: params.plan.slug,
        planName: params.plan.billingName,
        subscriptionId: params.subscription.id,
        credits: params.plan.creditsPerMonth,
        amountCents: params.plan.priceAmount * 100,
        currencyCode: "USD",
        periodEnd: grantWindow.windowEnd,
        isTest: params.subscription.test,
        status: "pending",
        source: "shopify-billing-sync",
      },
    });

    const allocation = await allocateCreditsToImai({
      shop: params.shop,
      imaiApiKey: params.imaiApiKey,
      plan: params.plan,
      subscription: params.subscription,
      grantKey: grantWindow.grantKey,
      windowStart: grantWindow.windowStart,
      windowEnd: grantWindow.windowEnd,
    });

    if (!allocation.ok) {
      await prisma.billingCreditAllocation.update({
        where: { grantKey: grantWindow.grantKey },
        data: {
          status: "failed",
          error: allocation.message,
          responseJson: allocation.responseJson
            ? JSON.stringify(allocation.responseJson)
            : null,
        },
      });

      return {
        state: "failed",
        grantKey: grantWindow.grantKey,
        message: allocation.message,
      };
    }

    await prisma.billingCreditAllocation.update({
      where: { grantKey: grantWindow.grantKey },
      data: {
        status: "granted",
        error: null,
        responseJson: allocation.responseJson
          ? JSON.stringify(allocation.responseJson)
          : null,
      },
    });

    newGrants += 1;
  }

  if (newGrants > 0) {
    return {
      state: "granted",
      alreadyGranted: false,
      grantKey: processedGrantKey,
      message:
        newGrants === 1
          ? `Granted ${params.plan.creditsPerMonth} IMAI credits for ${params.plan.nameWithInterval}.`
          : `Granted ${newGrants} missed monthly credit windows for ${params.plan.nameWithInterval}.`,
    };
  }

  return {
    state: "granted",
    alreadyGranted: true,
    grantKey: processedGrantKey,
    message:
      alreadyGrantedCount > 0
        ? `Credits for ${params.plan.nameWithInterval} are already synced through the current monthly grant window.`
        : `Credits for ${params.plan.nameWithInterval} do not need syncing yet.`,
  };
}

export async function syncShopBillingState(params: {
  shop: string;
  billing: BillingContextLike;
}): Promise<SyncedBillingState> {
  const billingContext = params.billing as {
    check: (options?: {
      plans?: string[];
      isTest?: boolean;
    }) => Promise<BillingCheckResponseObject>;
  };

  const billingCheck = await billingContext.check({
    plans: [...PAID_PLAN_NAMES],
    isTest: BILLING_TEST_MODE,
  });

  const activeSubscription = getNewestActiveSubscription(
    billingCheck.appSubscriptions,
  );

  if (!activeSubscription) {
    await prisma.shopBillingState.upsert({
      where: { shop: params.shop },
      update: {
        activePlanSlug: FREE_PLAN.slug,
        activePlanName: null,
        subscriptionId: null,
        subscriptionStatus: "FREE",
        currentPeriodEnd: null,
        isTest: false,
        lastSyncedAt: new Date(),
      },
      create: {
        shop: params.shop,
        activePlanSlug: FREE_PLAN.slug,
        subscriptionStatus: "FREE",
        lastSyncedAt: new Date(),
      },
    });

    return {
      activePlan: FREE_PLAN,
      activeSubscription: null,
      creditAllocation: {
        state: "not-applicable",
        message: "No active paid Shopify subscription found for this shop.",
      },
    };
  }

  const activePlan = getPaidPlanByBillingName(activeSubscription.name);
  if (!activePlan) {
    throw new Error(
      `Unsupported Shopify billing plan returned: ${activeSubscription.name}`,
    );
  }

  await prisma.shopBillingState.upsert({
    where: { shop: params.shop },
    update: {
      activePlanSlug: activePlan.slug,
      activePlanName: activePlan.billingName,
      subscriptionId: activeSubscription.id,
      subscriptionStatus: activeSubscription.status,
      currentPeriodEnd: toDate(activeSubscription.currentPeriodEnd),
      isTest: activeSubscription.test,
      lastSyncedAt: new Date(),
    },
    create: {
      shop: params.shop,
      activePlanSlug: activePlan.slug,
      activePlanName: activePlan.billingName,
      subscriptionId: activeSubscription.id,
      subscriptionStatus: activeSubscription.status,
      currentPeriodEnd: toDate(activeSubscription.currentPeriodEnd),
      isTest: activeSubscription.test,
      lastSyncedAt: new Date(),
    },
  });

  const storedKey = await prisma.apiKey.findUnique({
    where: { shop: params.shop },
  });

  if (!storedKey) {
    return {
      activePlan,
      activeSubscription,
      creditAllocation: {
        state: "not-applicable",
        message:
          "A paid Shopify plan is active, but no IMAI API key is connected for monthly credit sync yet.",
      },
    };
  }

  const creditAllocation = await ensureCreditsAllocated({
    shop: params.shop,
    imaiApiKey: decrypt(storedKey.encryptedKey),
    plan: activePlan,
    subscription: activeSubscription,
  });

  return {
    activePlan,
    activeSubscription,
    creditAllocation,
  };
}

export async function getLatestCreditAllocation(shop: string) {
  return prisma.billingCreditAllocation.findFirst({
    where: { shop },
    orderBy: { createdAt: "desc" },
  });
}

export function getBillingReturnUrl(requestUrl: URL) {
  const returnUrl = new URL("/app/billing", requestUrl.origin);
  returnUrl.searchParams.set("billing_return", "1");
  return returnUrl.toString();
}
