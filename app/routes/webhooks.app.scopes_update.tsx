import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async (_args: LoaderFunctionArgs) => {
    return new Response(undefined, {
        status: 405,
        statusText: "Method Not Allowed",
    });
};

export const action = async ({ request }: ActionFunctionArgs) => {
    try {
        const { payload, session, topic, shop } = await authenticate.webhook(request);
        console.log(`✅ Received ${topic} webhook for ${shop}`);

        const current = payload.current as string[];
        console.log("Scopes update received", {
            shop,
            scopeCount: current.length,
        });
        if (session) {
            await db.session.updateMany({
                where: {
                    shop,
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
