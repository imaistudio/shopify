import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

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

  // In production:
  // 1. Get encrypted API key from DB for this shop
  // 2. Decrypt it
  // 3. Call IMAI API with the key
  
  // const apiKey = await getDecryptedKeyForShop(session.shop);
  // const imaiUrl = new URL("https://www.imai.studio/api/v1/library");
  // if (type) imaiUrl.searchParams.set("type", type);
  // imaiUrl.searchParams.set("limit", limit.toString());
  // 
  // const resp = await fetch(imaiUrl, {
  //   headers: { Authorization: `Bearer ${apiKey}` },
  // });
  // const data = await resp.json();
  // return Response.json(data);

  // Mock response for development
  const mockAssets = [
    {
      id: "asset-1",
      type: "image",
      thumbnailUrl: "https://via.placeholder.com/300x300/4A90E2/ffffff?text=Asset+1",
      url: "https://via.placeholder.com/800x800/4A90E2/ffffff?text=Asset+1",
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      metadata: { width: 1024, height: 1024 },
    },
    {
      id: "asset-2", 
      type: "image",
      thumbnailUrl: "https://via.placeholder.com/300x300/50C878/ffffff?text=Asset+2",
      url: "https://via.placeholder.com/800x800/50C878/ffffff?text=Asset+2",
      createdAt: new Date(Date.now() - 172800000).toISOString(),
      metadata: { width: 1024, height: 1024 },
    },
    {
      id: "asset-3",
      type: "video",
      thumbnailUrl: "https://via.placeholder.com/300x300/E74C3C/ffffff?text=Video+1",
      url: "https://via.placeholder.com/800x800/E74C3C/ffffff?text=Video+1",
      createdAt: new Date(Date.now() - 259200000).toISOString(),
      metadata: { width: 1920, height: 1080 },
    },
  ];

  return Response.json({
    chatGenerations: mockAssets.slice(0, 2),
    marketingGenerations: mockAssets.slice(2),
    hasMore: false,
    total: mockAssets.length,
  });
}
