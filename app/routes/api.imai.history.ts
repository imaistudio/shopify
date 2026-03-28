import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const VALID_ENDPOINTS = new Set(["marketing", "ecommerce"]);
type HistoryResultPayload = {
  urls?: unknown;
  images?: {
    urls?: unknown;
  };
  details?: {
    title?: string;
  };
} & Record<string, unknown>;

function parseResult(result: string | null): HistoryResultPayload | null {
  if (!result) return null;

  try {
    return JSON.parse(result) as HistoryResultPayload;
  } catch (error) {
    console.error("Failed to parse history result payload:", error);
    return null;
  }
}

function getResultUrls(payload: HistoryResultPayload | null): string[] {
  const rawUrls = [
    ...(Array.isArray(payload?.urls) ? payload.urls : []),
    ...(Array.isArray(payload?.images?.urls) ? payload.images.urls : []),
  ];

  return Array.from(new Set(rawUrls.filter((url): url is string => typeof url === "string" && url.length > 0)));
}

/**
 * GET /api/imai/history
 * Returns recent completed generation jobs for the shop
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const endpoint = url.searchParams.get("endpoint");

  if (endpoint && !VALID_ENDPOINTS.has(endpoint)) {
    return Response.json(
      { error: "Invalid endpoint", message: "endpoint must be marketing or ecommerce" },
      { status: 400 },
    );
  }

  const recentJobs = await prisma.imaiJob.findMany({
    where: {
      shop: session.shop,
      status: "completed",
      ...(endpoint ? { endpoint } : {}),
    },
    orderBy: {
      updatedAt: "desc",
    },
    take: 20, // Show last 20 completed jobs
  });

  const history = recentJobs.map((job) => {
    const response = parseResult(job.result);

    return {
      id: job.id,
      prompt: job.prompt,
      endpoint: job.endpoint,
      results: getResultUrls(response),
      response,
      createdAt: job.createdAt,
    };
  });

  return Response.json(history);
}
