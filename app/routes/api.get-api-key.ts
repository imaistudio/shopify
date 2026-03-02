import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { decrypt } from "../lib/encryption.server";

/**
 * POST /api/get-api-key
 * Returns the decrypted API key for the authenticated shop
 * Used by frontend components to make authenticated API calls
 */
export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);

  // Check if shop has a stored API key
  const storedKey = await prisma.apiKey.findUnique({
    where: { shop: session.shop },
  });

  if (!storedKey) {
    return Response.json(
      { error: "No API key found for this shop" },
      { status: 404 }
    );
  }

  try {
    // Decrypt the stored API key
    const apiKey = decrypt(storedKey.encryptedKey);
    
    return Response.json({ apiKey });
  } catch (error) {
    console.error("Failed to decrypt API key:", error);
    return Response.json(
      { error: "Failed to decrypt API key" },
      { status: 500 }
    );
  }
}
