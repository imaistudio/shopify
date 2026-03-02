import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { shop, session, topic } = await authenticate.webhook(request);

    console.log(`✅ Received ${topic} webhook for ${shop}`);
    console.log("Request headers:", Object.fromEntries(request.headers.entries()));

    // Webhook requests can trigger multiple times and after an app has already been uninstalled.
    // If this webhook already ran, the session may have been deleted previously.
    if (session) {
      await db.session.deleteMany({ where: { shop } });
      console.log(`🗑️ Deleted session for shop: ${shop}`);
    } else {
      console.log(`⚠️ No session found for shop: ${shop} (already uninstalled?)`);
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("❌ Webhook processing error:", error);
    return new Response("Error", { status: 500 });
  }
};
