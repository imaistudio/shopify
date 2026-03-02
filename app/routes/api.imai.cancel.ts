import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

/**
 * POST /api/imai/cancel
 * Cancels a generation job by updating its status in the database
 * Body: { jobId: string, shop: string }
 */
export async function action({ request }: LoaderFunctionArgs) {
  if (request.method !== "POST") {
    return Response.json(
      { error: "Method not allowed" },
      { status: 405 }
    );
  }

  try {
    const body = await request.json();
    const { jobId, shop } = body;

    if (!jobId || !shop) {
      return Response.json(
        { error: "Missing jobId or shop parameter" },
        { status: 400 }
      );
    }

    console.log("Cancel API called for jobId:", jobId, "shop:", shop);

    // Update job status to cancelled in database
    const updatedJob = await prisma.imaiJob.updateMany({
      where: { 
        jobId,
        shop,
        status: { in: ['queued', 'generating'] } // Only cancel active jobs
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
