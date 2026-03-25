import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
    try {
        const { payload, session, topic, shop } = await authenticate.webhook(request);
        console.log(`✅ Received ${topic} webhook for ${shop}`);
        console.log("Payload:", JSON.stringify(payload, null, 2));

        const current = payload.current as string[];
        if (session) {
            await db.session.update({   
                where: {
                    id: session.id
                },
                data: {
                    scope: current.toString(),
                },
            });
            console.log(`🔄 Updated scopes for shop: ${shop}`);
        } else {
            console.log(`⚠️ No session found for shop: ${shop}`);
        }
        
        return new Response("OK", { status: 200 });
    } catch (error) {
        if (error instanceof Response) {
            return error;
        }
        console.error("❌ Webhook processing error:", error);
        return new Response("Error", { status: 500 });
    }
};
