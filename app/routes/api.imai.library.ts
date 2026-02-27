import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { decrypt } from "../lib/encryption.server";

/**
 * GET /api/imai/library
 * Proxies the IMAI library endpoint with pagination and filtering
 * Query params: type, limit, offset
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  
  const type = url.searchParams.get("type") || "";
  const limit = parseInt(url.searchParams.get("limit") || "24", 10);
  const offset = parseInt(url.searchParams.get("offset") || "0", 10);

  // Get stored API key for this shop
  const storedKey = await prisma.apiKey.findUnique({
    where: { shop: session.shop },
  });
  
  if (!storedKey) {
    return Response.json({ error: "No API key found" }, { status: 401 });
  }
  
  const apiKey = decrypt(storedKey.encryptedKey);
  
  const imaiUrl = new URL("https://www.imai.studio/api/v1/library");
  // Only fetch images, exclude videos and 3D models
  imaiUrl.searchParams.set("type", "image");
  imaiUrl.searchParams.set("limit", limit.toString());
  imaiUrl.searchParams.set("offset", offset.toString());
  
  const resp = await fetch(imaiUrl, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  
  if (!resp.ok) {
    throw new Error(`IMAI API error: ${resp.status}`);
  }
  
  const data = await resp.json();
  return Response.json(data);
}
