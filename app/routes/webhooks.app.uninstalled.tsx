import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async () => {
  return new Response(undefined, {
    status: 405,
    statusText: "Method Not Allowed",
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { shop, session, topic } = await authenticate.webhook(request);

    console.log(`✅ Received ${topic} webhook for ${shop}`);

    // Webhook requests can trigger multiple times and after sessions are gone,
    // so cleanup must be idempotent and independent of the session payload.
    await Promise.all([
      db.session.deleteMany({ where: { shop } }),
      db.apiKey.deleteMany({ where: { shop } }),
      db.shopBillingState.deleteMany({ where: { shop } }),
      db.billingCreditAllocation.deleteMany({ where: { shop } }),
      db.imaiJob.deleteMany({ where: { shop } }),
    ]);
    console.log(`🗑️ Deleted shop-scoped app data for shop: ${shop}`, {
      hadSession: !!session,
    });

    return new Response("OK", { status: 200 });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error("❌ Webhook processing error:", error);
    return new Response("Error", { status: 500 });
  }
};
