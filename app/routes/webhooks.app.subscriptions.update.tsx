import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate, unauthenticated } from "../shopify.server";
import db from "../db.server";
import { syncShopBillingStateFromAdmin } from "../lib/billing.server";
import { getPaidPlanByBillingName } from "../lib/billing/plans";

export const loader = async (_args: LoaderFunctionArgs) => {
  return new Response(undefined, {
    status: 405,
    statusText: "Method Not Allowed",
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { payload, topic, shop } = await authenticate.webhook(request);
    console.log(`✅ Received ${topic} webhook for ${shop}`);

    const subscriptionPayload =
      payload &&
      typeof payload === "object" &&
      "app_subscription" in payload &&
      payload.app_subscription &&
      typeof payload.app_subscription === "object"
        ? (payload.app_subscription as Record<string, unknown>)
        : (payload as Record<string, unknown>);

    const name =
      typeof subscriptionPayload.name === "string"
        ? subscriptionPayload.name
        : null;
    const status =
      typeof subscriptionPayload.status === "string"
        ? subscriptionPayload.status
        : "UNKNOWN";
    const subscriptionId =
      typeof subscriptionPayload.admin_graphql_api_id === "string"
        ? subscriptionPayload.admin_graphql_api_id
        : typeof subscriptionPayload.id === "string"
          ? subscriptionPayload.id
          : null;
    const matchedPlan = getPaidPlanByBillingName(name);

    await db.shopBillingState.upsert({
      where: { shop },
      update: {
        activePlanSlug: matchedPlan?.slug ?? "free",
        activePlanName: matchedPlan?.billingName ?? null,
        subscriptionId,
        subscriptionStatus: status,
        lastSyncedAt: new Date(),
      },
      create: {
        shop,
        activePlanSlug: matchedPlan?.slug ?? "free",
        activePlanName: matchedPlan?.billingName ?? null,
        subscriptionId,
        subscriptionStatus: status,
        lastSyncedAt: new Date(),
      },
    });

    if (status === "ACTIVE") {
      try {
        const { admin } = await unauthenticated.admin(shop);
        const billingSync = await syncShopBillingStateFromAdmin({
          shop,
          admin,
        });

        console.log("✅ Synced billing credits after subscription webhook", {
          shop,
          activePlan: billingSync.activePlan.slug,
          creditAllocation: billingSync.creditAllocation,
        });
      } catch (syncError) {
        console.error("❌ Billing credit sync after subscription webhook failed", {
          shop,
          status,
          subscriptionId,
          error: syncError,
        });
      }
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    console.error("❌ Billing webhook processing error:", error);
    return new Response("Error", { status: 500 });
  }
};
