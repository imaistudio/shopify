import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

/**
 * POST /api/imai/generate
 * Proxies generate requests to IMAI API
 * Body: { prompt, url (optional), mode: 'marketing' | 'design', shop }
 */
export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  
  const body = await request.json();
  const { prompt, url, mode, shop } = body;

  // In production:
  // 1. Get encrypted API key from DB
  // 2. Decrypt it
  // 3. Call appropriate IMAI endpoint based on mode

  // const apiKey = await getDecryptedKeyForShop(session.shop);
  
  // const endpoint = mode === 'marketing' 
  //   ? '/api/v1/generate/marketing'
  //   : '/api/v1/generate/design';
  
  // const resp = await fetch(`https://imai.studio${endpoint}`, {
  //   method: 'POST',
  //   headers: {
  //     'Authorization': `Bearer ${apiKey}`,
  //     'Content-Type': 'application/json',
  //   },
  //   body: JSON.stringify({
  //     prompt,
  //     url,
  //     action: 'generate',
  //     async: true,
  //     webhookUrl: `${process.env.APP_URL}/api/imai/webhook`,
  //     webhookSecret: process.env.IMAI_WEBHOOK_SECRET,
  //   }),
  // });
  
  // const data = await resp.json();
  // return Response.json(data);

  // Mock response for development
  const mockJobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  return Response.json({
    accepted: true,
    jobId: mockJobId,
    statusEndpoint: `/api/v1/generate/status?jobId=${mockJobId}`,
    message: "Generation job queued",
  });
}
