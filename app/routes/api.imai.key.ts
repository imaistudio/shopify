import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

/**
 * GET /api/imai/key/status
 * Returns the connection status, masked key, and balance
 * Used on app load to check if API key is already connected
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  // In production:
  // 1. Check if shop has a stored API key
  // 2. If yes, decrypt and get masked version
  // 3. Fetch current balance from IMAI

  // const storedKey = await db.imaiApiKey.findUnique({
  //   where: { shop: session.shop },
  // });
  
  // if (!storedKey) {
  //   return Response.json({
  //     connected: false,
  //     maskedKey: null,
  //     balance: null,
  //   });
  // }

  // const apiKey = decrypt(storedKey.encryptedKey);
  // const maskedKey = `${apiKey.slice(0, 12)}••••${apiKey.slice(-4)}`;
  
  // const creditsResp = await fetch("https://www.imai.studio/api/v1/credits", {
  //   headers: { Authorization: `Bearer ${apiKey}` },
  // });
  // const creditsData = await creditsResp.json();

  // return Response.json({
  //   connected: true,
  //   maskedKey,
  //   balance: creditsData.balance,
  // });

  // For development - return disconnected state
  return Response.json({
    connected: false,
    maskedKey: null,
    balance: null,
  });
}
