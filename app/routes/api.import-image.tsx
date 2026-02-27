import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export async function action({ request }: ActionFunctionArgs) {
  const { admin } = await authenticate.admin(request);

  try {
    const body = await request.json();
    const { imageUrl, altText, filename } = body as {
      imageUrl: string;
      altText?: string;
      filename?: string;
    };

    if (!imageUrl) {
      return Response.json(
        { ok: false, errors: [{ field: "imageUrl", message: "Image URL is required" }] },
        { status: 400 }
      );
    }

    // Call Admin GraphQL: fileCreate mutation
    const response = await admin.graphql(
      `#graphql
      mutation ImportImageToFiles($files: [FileCreateInput!]!) {
        fileCreate(files: $files) {
          files {
            id
            fileStatus
            alt
            createdAt
            ... on MediaImage {
              image {
                width
                height
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }`,
      {
        variables: {
          files: [
            {
              alt: altText ?? "Image from IMAI Studio",
              contentType: "IMAGE",
              originalSource: imageUrl,
              filename: filename ?? `imai-image-${Date.now()}.jpg`,
            },
          ],
        },
      }
    );

    const jsonResponse = await response.json();
    const payload = jsonResponse.data.fileCreate;

    if (payload.userErrors?.length) {
      console.error("fileCreate errors", payload.userErrors);
      return Response.json(
        { ok: false, errors: payload.userErrors },
        { status: 400 }
      );
    }

    // Return created file info
    return Response.json({
      ok: true,
      file: payload.files[0],
    });

  } catch (error) {
    console.error("Error importing image:", error);
    return Response.json(
      { ok: false, errors: [{ field: "general", message: "Failed to import image" }] },
      { status: 500 }
    );
  }
};
