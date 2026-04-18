import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

/**
 * GET /api/imai/active-jobs
 * Returns non-completed jobs (queued, running) for the shop
 * Used to restore polling state after page navigation/remount
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  const activeJobs = await prisma.imaiJob.findMany({
    where: {
      shop: session.shop,
      status: {
        in: ["queued", "running", "processing"],
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 10, // Limit to recent active jobs
  });

  return Response.json({
    success: true,
    jobs: activeJobs.map(job => ({
      jobId: job.jobId,
      status: job.status,
      prompt: job.prompt,
      endpoint: job.endpoint,
      createdAt: job.createdAt,
    })),
  });
}
