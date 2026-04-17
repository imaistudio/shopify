import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { payload, topic, shop } = await authenticate.webhook(request);

    console.log(`✅ Received ${topic} compliance webhook for ${shop}`);

    switch (topic.toLowerCase()) {
      case "shop/redact":
        await Promise.all([
          db.session.deleteMany({ where: { shop } }),
          db.apiKey.deleteMany({ where: { shop } }),
          db.shopBillingState.deleteMany({ where: { shop } }),
          db.billingCreditAllocation.deleteMany({ where: { shop } }),
          db.imaiJob.deleteMany({ where: { shop } }),
        ]);
        break;
      case "customers/data_request":
      case "customers/redact":
        // The app stores shop-scoped config and job metadata only, not customer records.
        break;
      default:
        console.warn(`Unhandled compliance webhook topic: ${topic}`);
    }

    console.log("Compliance webhook processed", {
      shop,
      topic,
      hasPayload: !!payload,
    });
    return new Response("OK", { status: 200 });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    console.error("❌ Compliance webhook processing error:", error);
    return new Response("Error", { status: 500 });
  }
};
