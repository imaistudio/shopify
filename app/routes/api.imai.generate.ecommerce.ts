import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { decrypt } from "../lib/encryption.server";

/**
 * POST /api/imai/generate/ecommerce
 * Calls IMAI e-commerce API with async polling
 * Body: { prompt?, url, shop }
 */
export async function action({ request }: ActionFunctionArgs) {
  console.log("E-commerce Generate API called");
  
  const { session } = await authenticate.admin(request);
  console.log("Session authenticated for shop:", session.shop);
  
  const body = await request.json();
  const { prompt, url, shop } = body;
  
  console.log("Request body:", { prompt: prompt?.substring(0, 50) + "...", url, shop });

  if (!url || typeof url !== 'string') {
    return Response.json(
      { error: "Invalid request body", message: "url is required and must be a string" },
      { status: 400 }
    );
  }

  // Get API key for this shop
  const apiKeyRecord = await prisma.apiKey.findUnique({
    where: { shop: session.shop }
  });

  if (!apiKeyRecord) {
    console.log("No API key found for shop:", session.shop);
    return Response.json(
      { error: "API key not configured", message: "Please configure your IMAI API key in settings" },
      { status: 401 }
    );
  }

  console.log("API key found for shop:", session.shop);
  
  // Decrypt the API key before using it
  const apiKey = decrypt(apiKeyRecord.encryptedKey);
  
  const endpoint = 'https://www.imai.studio/api/v1/generate/ecommerce';
  
  console.log("Using endpoint:", endpoint);
  
  // Prepare request body for e-commerce API
  const requestBody: any = {
    url: url.trim(),
    platforms: ["shopify"],
    includeImages: true,
    includeDetails: true,
    includeTitles: true,
    includeSpecs: true,
    async: true,
  };

  if (prompt && prompt.trim()) {
    requestBody.prompt = prompt.trim();
  }

  console.log("Request body for IMAI:", requestBody);

  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
    
    console.log("IMAI e-commerce API response status:", resp.status);
    
    if (!resp.ok) {
      const errorData = await resp.json().catch(() => ({}));
      console.error("IMAI API error:", errorData);
      return Response.json(
        { error: errorData.error || "Generation request failed", message: errorData.message || "Please try again" },
        { status: resp.status }
      );
    }
    
    const data = await resp.json();
    console.log("IMAI API response:", data);
    
    // Store job in database if we got a jobId
    if (data.jobId) {
      console.log("Storing job in database:", data.jobId);
      await prisma.imaiJob.create({
        data: {
          jobId: data.jobId,
          shop: session.shop,
          status: data.status || 'queued',
          endpoint: 'ecommerce',
          prompt: prompt?.trim() || '',
          imageUrl: url.trim(),
        }
      });
    }
    
    return Response.json(data);
  } catch (error) {
    console.error('IMAI API Error:', error);
    return Response.json(
      { error: "Network error", message: "Failed to connect to generation service" },
      { status: 500 }
    );
  }
}
