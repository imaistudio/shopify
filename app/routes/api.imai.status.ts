import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { decrypt } from "../lib/encryption.server";

/**
 * GET /api/imai/status?jobId=<jobId>
 * Checks job status from database first, falls back to IMAI API
 * Returns status in format matching IMAI API documentation
 * 
 * Note: This endpoint handles both authenticated and unauthenticated requests
 * Unauthenticated requests can only access jobs that exist in the database
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId");

  console.log("Status API called for jobId:", jobId);

  if (!jobId) {
    return Response.json(
      { error: "Missing jobId parameter" },
      { status: 400 }
    );
  }

  // First check local database - this works for both authenticated and unauthenticated requests
  const localJob = await prisma.imaiJob.findUnique({
    where: { jobId }
  });

  console.log("Local job found:", !!localJob, localJob?.status);

  if (localJob) {
    const response: any = {
      success: true,
      jobId: localJob.jobId,
      endpoint: localJob.endpoint,
      status: localJob.status,
    };

    if (localJob.result) {
      response.result = JSON.parse(localJob.result);
    }

    if (localJob.error) {
      response.error = localJob.error;
    }

    console.log("Returning local job status:", response.status);
    return Response.json(response);
  }

  console.log("Job not found locally, attempting authentication...");

  // If not found in database, try to authenticate for API polling
  let session;
  try {
    const authResult = await authenticate.admin(request);
    session = authResult.session;
    console.log("Authentication successful for shop:", session.shop);
  } catch (error) {
    console.log("Authentication failed:", (error as Error).message);
    // If authentication fails and we don't have the job in DB, return error
    return Response.json(
      { error: "Job not found and authentication required" },
      { status: 404 }
    );
  }

  // Get API key and poll IMAI API directly
  const apiKeyRecord = await prisma.apiKey.findUnique({
    where: { shop: session.shop }
  });

  if (!apiKeyRecord) {
    console.log("No API key found for shop:", session.shop);
    return Response.json(
      { error: "API key not configured" },
      { status: 401 }
    );
  }

  // In production, you would decrypt the key here
  // const apiKey = await decryptApiKey(apiKeyRecord.encryptedKey);
  const apiKey = decrypt(apiKeyRecord.encryptedKey); // Decrypt the key

  try {
    console.log("Polling IMAI API for jobId:", jobId);
    const resp = await fetch(
      `https://www.imai.studio/api/v1/generate/status?jobId=${jobId}`,
      { 
        headers: { 
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        } 
      }
    );
    
    console.log("IMAI status API response:", resp.status);
    
    if (!resp.ok) {
      return Response.json(
        { error: "Failed to check job status" },
        { status: resp.status }
      );
    }
    
    const data = await resp.json();
    console.log("IMAI status response:", data);
    
    // Update database with latest status
    await prisma.imaiJob.upsert({
      where: { jobId },
      create: {
        jobId: data.jobId,
        shop: session.shop,
        status: data.status,
        endpoint: data.endpoint || 'unknown',
        result: data.result ? JSON.stringify(data.result) : null,
        error: data.error || null,
        prompt: '', // Unknown at this point
        imageUrl: null, // Unknown at this point
        webhookDelivered: data.status === 'completed',
      },
      update: {
        status: data.status,
        result: data.result ? JSON.stringify(data.result) : null,
        error: data.error || null,
        updatedAt: new Date(),
        webhookDelivered: data.status === 'completed',
      }
    });
    
    return Response.json(data);
  } catch (error) {
    console.error('Status check error:', error);
    return Response.json(
      { error: "Network error while checking status" },
      { status: 500 }
    );
  }
}
