import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

/**
 * GET /api/imai/credits
 * Returns the current credit balance for the connected shop
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  
  // In production, you would:
  // 1. Get the encrypted API key from your database for this shop
  // 2. Decrypt it
  // 3. Call the IMAI API
  
  // For now, return mock data
  // const apiKey = await getDecryptedKeyForShop(session.shop);
  // const resp = await fetch("https://www.imai.studio/api/v1/credits", {
  //   headers: { Authorization: `Bearer ${apiKey}` },
  // });
  // const data = await resp.json();
  
  return Response.json({ 
    balance: 1500,
  });
}
