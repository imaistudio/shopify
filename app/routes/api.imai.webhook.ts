import type { ActionFunctionArgs } from "react-router";
import crypto from "crypto";

/**
 * POST /api/imai/webhook
 * Receives webhook callbacks from IMAI when generation jobs complete
 * This endpoint is PUBLIC (no session auth) as it's called by IMAI servers
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
  // 1. Upsert job result in DB (idempotent - IMAI may retry)
  // 2. Notify connected clients via WebSocket or push notification
  // 3. Store the result for the polling endpoint to find

  // await db.imaiJob.upsert({
  //   where: { jobId: payload.jobId },
  //   create: {
  //     jobId: payload.jobId,
  //     status: payload.status,
  //     result: JSON.stringify(payload.result),
  //     completedAt: new Date(payload.completedAt || Date.now()),
  //     endpoint: payload.endpoint,
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
