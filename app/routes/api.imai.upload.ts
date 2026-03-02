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

  // Upload to TempFile.org with 24h expiry
  const tempfileFormData = new FormData();
  tempfileFormData.append("files", image);
  tempfileFormData.append("expiryHours", "24");

  try {
    const tempfileResp = await fetch("https://tempfile.org/api/upload/local", {
      method: "POST",
      body: tempfileFormData,
    });

    if (!tempfileResp.ok) {
      throw new Error(`TempFile upload failed: ${tempfileResp.status}`);
    }

    const tempfileData = await tempfileResp.json();

    if (!tempfileData.success || !tempfileData.files?.[0]?.url) {
      throw new Error("Invalid response from TempFile API");
    }

    // Append /preview to make the URL directly accessible
    const baseUrl = tempfileData.files[0].url;
    const publicUrl = baseUrl.endsWith('/') ? `${baseUrl}preview` : `${baseUrl}/preview`;

    return Response.json({
      publicUrl,
      success: true,
    });
  } catch (error) {
    console.error("TempFile upload error:", error);
    return Response.json(
      { error: "Failed to upload image to temporary storage" },
      { status: 500 }
    );
  }
}
