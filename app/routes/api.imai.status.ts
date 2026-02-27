import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

/**
 * GET /api/imai/status?jobId=<jobId>
 * Checks job status from local DB first, falls back to IMAI API
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId");

  if (!jobId) {
    return Response.json(
      { error: "Missing jobId parameter" },
      { status: 400 }
    );
  }

  // In production:
  // 1. Check local DB first - webhook may have already stored the result
  // 2. If not found, poll IMAI API directly

  // const localJob = await db.imaiJob.findUnique({ where: { jobId } });
  // if (localJob) {
  //   return Response.json({
  //     status: localJob.status,
  //     result: JSON.parse(localJob.result),
  //   });
  // }

  // const apiKey = await getDecryptedKeyForShop(session.shop);
  // const resp = await fetch(
  //   `https://imai.studio/api/v1/generate/status?jobId=${jobId}`,
  //   { headers: { Authorization: `Bearer ${apiKey}` } }
  // );
  // return Response.json(await resp.json());

  // Mock response - simulate job completion after a few seconds
  const now = Date.now();
  const jobCreated = parseInt(jobId.split("_")[1], 10);
  const elapsed = now - jobCreated;

  if (elapsed > 5000) {
    // Job completed after 5 seconds
    return Response.json({
      status: "completed",
      result: {
        versionId: `v_${jobId}`,
        urls: [
          `https://via.placeholder.com/1024x1024/4A90E2/ffffff?text=Generated+1+${jobId.slice(-6)}`,
          `https://via.placeholder.com/1024x1024/50C878/ffffff?text=Generated+2+${jobId.slice(-6)}`,
          `https://via.placeholder.com/1024x1024/E74C3C/ffffff?text=Generated+3+${jobId.slice(-6)}`,
        ],
        assetIds: ["asset_1", "asset_2", "asset_3"],
        failedIds: [],
        pendingIds: [],
        linkIds: [],
      },
    });
  }

  return Response.json({
    status: "running",
    progress: Math.min(Math.floor((elapsed / 5000) * 100), 90),
  });
}
