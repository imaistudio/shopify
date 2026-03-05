import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

/**
 * GET /api/imai/status?jobId=<jobId>
 * Checks job status from LOCAL DATABASE ONLY - never hits IMAI API
 * This prevents rate limit issues from polling
 * 
 * Note: Jobs are updated via webhooks from IMAI. Polling this endpoint
 * only reads from your local database, making it safe to poll frequently.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId");

  console.log("Status API called for jobId (DB only):", jobId);

  if (!jobId) {
    return Response.json(
      { error: "Missing jobId parameter" },
      { status: 400 }
    );
  }

  // ONLY check local database - never hit IMAI API to avoid rate limits
  const localJob = await prisma.imaiJob.findUnique({
    where: { jobId }
  });

  console.log("Local job found:", !!localJob, localJob?.status);

  if (!localJob) {
    return Response.json(
      { error: "Job not found" },
      { status: 404 }
    );
  }

  // Return status from database only
  const response: any = {
    success: true,
    jobId: localJob.jobId,
    endpoint: localJob.endpoint,
    status: localJob.status,
    job: {
      jobId: localJob.jobId,
      status: localJob.status,
      endpoint: localJob.endpoint,
      createdAt: localJob.createdAt,
      updatedAt: localJob.updatedAt,
    }
  };

  if (localJob.result) {
    response.result = JSON.parse(localJob.result);
    response.job.result = localJob.result;
  }

  if (localJob.error) {
    response.error = localJob.error;
    response.job.error = localJob.error;
  }

  console.log("Returning local job status:", response.status, "hasResult:", !!response.result);
  return Response.json(response);
}
