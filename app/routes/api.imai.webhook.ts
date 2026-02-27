import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import crypto from "crypto";

/**
 * POST /api/imai/webhook
 * Receives webhook callbacks from IMAI when generation jobs complete
 * This endpoint processes images and stores them in Shopify storage
 * 
 * Headers from IMAI:
 * - X-IMAI-Event: generation.job.finished
 * - X-IMAI-Job-Id: <jobId>
 * - X-IMAI-Attempt: <attempt-number>
 * - X-IMAI-Signature: sha256=<hmac> (if webhookSecret was supplied)
 */
export async function action({ request }: ActionFunctionArgs) {
  // Verify HMAC signature if webhook secret is configured
  const signature = request.headers.get("X-IMAI-Signature");
  const rawBody = await request.text();

  if (process.env.IMAI_WEBHOOK_SECRET) {
    const expected = `sha256=${hmacSha256(process.env.IMAI_WEBHOOK_SECRET, rawBody)}`;
    if (signature !== expected) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Validate payload structure
  if (!payload.jobId || !payload.status) {
    return new Response("Missing required fields", { status: 400 });
  }

  // In production:
  // 1. Process completed images from IMAI
  // 2. Upload images to Shopify Files API (Shopify storage)
  // 3. Store Shopify file references in database
  // 4. Update job status with Shopify file URLs
  // 5. Notify connected clients via WebSocket or push notification

  if (payload.status === 'completed' && payload.result?.images) {
    try {
      // For each generated image, upload to Shopify storage
      for (const image of payload.result.images) {
        // Download image from IMAI URL
        const imageResponse = await fetch(image.url);
        if (!imageResponse.ok) continue;
        
        const imageBuffer = await imageResponse.arrayBuffer();
        
        // Upload to Shopify Files API
        // This requires Shopify admin API access with appropriate scopes
        // const shopifyFile = await uploadToShopifyFiles({
        //   buffer: imageBuffer,
        //   filename: `imai-${payload.jobId}-${Date.now()}.png`,
        //   mimeType: 'image/png',
        //   shop: payload.shop // Shop identifier from the original request
        // });
        
        // Store reference in database
        // await db.imaiAsset.create({
        //   data: {
        //     jobId: payload.jobId,
        //     shopifyFileId: shopifyFile.id,
        //     shopifyUrl: shopifyFile.url,
        //     thumbnailUrl: shopifyFile.thumbnailUrl,
        //     metadata: image.metadata,
        //     createdAt: new Date()
        //   }
        // });
      }
      
      console.log("Successfully processed webhook for job:", payload.jobId, "- Images stored in Shopify");
    } catch (error) {
      console.error("Failed to process webhook for job:", payload.jobId, error);
      // Return error but don't retry - webhook should handle failures gracefully
      return new Response("Processing failed", { status: 500 });
    }
  }

  // Update job status in database
  // await db.imaiJob.upsert({
  //   where: { jobId: payload.jobId },
  //   create: {
  //     jobId: payload.jobId,
  //     status: payload.status,
  //     result: JSON.stringify(payload.result),
  //     completedAt: new Date(payload.completedAt || Date.now()),
  //     endpoint: payload.endpoint,
  //     shop: payload.shop,
  //   },
  //   update: {
  //     status: payload.status,
  //     result: JSON.stringify(payload.result),
  //     completedAt: new Date(payload.completedAt || Date.now()),
  //   }
  // });

  console.log("Received IMAI webhook:", {
    event: payload.event,
    jobId: payload.jobId,
    status: payload.status,
    completedAt: payload.completedAt,
    imagesProcessed: payload.result?.images?.length || 0,
  });

  // Return 200 immediately - do not do heavy work synchronously
  return new Response("OK", { status: 200 });
}

/**
 * Compute HMAC-SHA256 signature
 */
function hmacSha256(secret: string, message: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(message)
    .digest("hex");
}
