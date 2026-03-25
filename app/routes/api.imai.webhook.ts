import type { ActionFunctionArgs } from "react-router";
import prisma from "../db.server";
import crypto from "crypto";
import { sendEventToShop } from './api.imai.events';

/**
 * POST /api/imai/webhook
 * Receives webhook callbacks from IMAI when generation jobs complete
 * Updates job status in database and processes results
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

  console.log("Webhook received, raw body:", rawBody);

  if (process.env.IMAI_WEBHOOK_SECRET) {
    const expected = `sha256=${hmacSha256(process.env.IMAI_WEBHOOK_SECRET, rawBody)}`;
    if (
      !signature ||
      signature.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    ) {
      console.log("Signature mismatch. Expected:", expected, "Received:", signature);
      return new Response("Unauthorized", { status: 401 });
    }
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  console.log("Parsed payload:", payload);

  // Validate payload structure
  if (!payload.jobId || !payload.status) {
    return new Response("Missing required fields", { status: 400 });
  }

  try {
    // First, try to find the existing job to get the shop
    const existingJob = await prisma.imaiJob.findUnique({
      where: { jobId: payload.jobId }
    });

    const shop = existingJob?.shop || 'unknown';

    // Update job status in database
    const updateData: Record<string, unknown> = {
      status: payload.status,
      updatedAt: new Date(),
    };

    if (payload.result) {
      updateData.result = JSON.stringify(payload.result);
    }

    if (payload.error) {
      updateData.error = payload.error;
    }

    if (payload.status === 'completed') {
      updateData.webhookDelivered = true;
    }

    await prisma.imaiJob.upsert({
      where: { jobId: payload.jobId },
      create: {
        jobId: payload.jobId,
        status: payload.status,
        result: payload.result ? JSON.stringify(payload.result) : null,
        error: payload.error || null,
        webhookDelivered: payload.status === 'completed',
        endpoint: payload.endpoint || 'unknown',
        shop: shop, // Use the shop from existing job
        prompt: existingJob?.prompt || '', // Use existing prompt
        imageUrl: existingJob?.imageUrl || null, // Use existing image URL
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      update: updateData,
    });

    console.log("Successfully processed webhook for job:", payload.jobId, {
      status: payload.status,
      shop: shop,
      endpoint: payload.endpoint,
      completedAt: payload.completedAt,
      hasResult: !!payload.result,
    });

    // Verify update
    const updatedJob = await prisma.imaiJob.findUnique({
      where: { jobId: payload.jobId }
    });
    console.log("Updated job in database:", updatedJob?.status, updatedJob?.shop, updatedJob?.result ? "has result" : "no result");

    // Send SSE event to connected clients
    if (updatedJob && updatedJob.shop !== 'unknown') {
      console.log("Sending SSE event to shop:", updatedJob.shop);
      sendEventToShop(updatedJob.shop, {
        type: 'job_update',
        jobId: payload.jobId,
        status: payload.status,
        result: payload.result,
        error: payload.error,
      });
    } else {
      console.log("Not sending SSE event - shop unknown or job not found");
    }

    // TODO: In production, you might want to:
    // 1. Download images from IMAI URLs and store in Shopify
    // 2. Send real-time notifications to connected clients
    // 3. Trigger additional processing workflows

  } catch (error) {
    console.error("Failed to process webhook for job:", payload.jobId, error);
    return new Response("Database update failed", { status: 500 });
  }

  // Return 200 immediately - webhook processing should be fast
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
