import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { decrypt } from "../lib/encryption.server";

/**
 * GET /api/v1/library/marketing
 * Proxies the IMAI marketing library endpoint with cursor-based pagination
 * Query params: numItems, type, cursor
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  
  const numItems = url.searchParams.get("numItems") || "50";
  const type = url.searchParams.get("type") || "";
  const cursor = url.searchParams.get("cursor") || "";

  // Get stored API key for this shop
  const storedKey = await prisma.apiKey.findUnique({
    where: { shop: session.shop },
  });
  
  if (!storedKey) {
    return Response.json({ error: "No API key found" }, { status: 401 });
  }
  
  const apiKey = decrypt(storedKey.encryptedKey);
  
  const imaiUrl = new URL("https://www.imai.studio/api/v1/library/marketing");
  imaiUrl.searchParams.set("numItems", numItems);
  if (type) imaiUrl.searchParams.set("type", type);
  if (cursor) imaiUrl.searchParams.set("cursor", cursor);
  
  const resp = await fetch(imaiUrl, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  
  if (!resp.ok) {
    const errorText = await resp.text();
    console.error('IMAI API Error Response:', errorText);
    throw new Error(`IMAI API error: ${resp.status} - ${errorText}`);
  }
  
  const data = await resp.json();
  return Response.json(data);
}
