import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

/**
 * GET /api/imai/history
 * Returns recent completed generation jobs for the shop
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  const recentJobs = await prisma.imaiJob.findMany({
    where: {
      shop: session.shop,
      status: "completed",
    },
    orderBy: {
      updatedAt: "desc",
    },
    take: 20, // Show last 20 completed jobs
  });

  const history = recentJobs.map(job => ({
    id: job.id,
    prompt: job.prompt,
    results: job.result ? JSON.parse(job.result).urls || [] : [],
    createdAt: job.createdAt,
  }));

  return Response.json(history);
}
