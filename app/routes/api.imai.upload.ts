import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

/**
 * POST /api/imai/upload
 * Accepts an image file and returns a public URL
 * The image can then be used as a reference for generation
 */
export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  
  const formData = await request.formData();
  const image = formData.get("image") as File | null;
  const shop = formData.get("shop") as string;

  if (!image) {
    return Response.json(
      { error: "No image provided" },
      { status: 400 }
    );
  }

  // Validate file type
  if (!image.type.startsWith("image/")) {
    return Response.json(
      { error: "Invalid file type. Only images are allowed." },
      { status: 400 }
    );
  }

  // Validate file size (10MB max)
  if (image.size > 10 * 1024 * 1024) {
    return Response.json(
      { error: "File too large. Maximum size is 10MB." },
      { status: 400 }
    );
  }

  // In production:
  // 1. Upload to your CDN (e.g., Cloudflare R2, AWS S3, etc.)
  // 2. Store the reference in your database
  // 3. Return the public URL

  // For now, return a mock URL
  // In production, you'd actually upload the file
  
  return Response.json({
    publicUrl: `https://cdn.example.com/uploads/${shop}/${Date.now()}_${image.name}`,
    success: true,
  });
}
