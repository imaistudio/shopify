import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

/**
 * POST /api/imai/cancel
 * Cancels a generation job by updating its status in the database
 * Body: { jobId: string, shop: string }
 */
export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  try {
    const body = await request.json();
    const { jobId } = body as { jobId?: string };

    if (!jobId) {
      return Response.json(
        { error: "Missing jobId parameter" },
        { status: 400 }
      );
    }

    console.log("Cancel API called for jobId:", jobId, "shop:", session.shop);

    // Update job status to cancelled in database
    const updatedJob = await prisma.imaiJob.updateMany({
      where: { 
        jobId,
        shop: session.shop,
        status: { in: ['queued', 'running', 'processing'] }
      },
      data: { 
        status: 'cancelled',
        updatedAt: new Date()
      }
    });

    console.log("Cancelled jobs count:", updatedJob.count);

    if (updatedJob.count === 0) {
      return Response.json(
        { error: "Job not found or already completed" },
        { status: 404 }
      );
    }

    return Response.json({ 
      success: true, 
      message: "Job cancelled successfully" 
    });

  } catch (error) {
    console.error("Cancel job error:", error);
    return Response.json(
      { error: "Failed to cancel job" },
      { status: 500 }
    );
  }
}
