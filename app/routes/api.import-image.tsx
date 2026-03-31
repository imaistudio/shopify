import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

const PENDING_FILE_STATUSES = new Set(["UPLOADED", "PROCESSING"]);
const READY_FILE_STATUS = "READY";
const FAILED_FILE_STATUS = "FAILED";
const KNOWN_IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "bmp",
  "avif",
  "tiff",
  "svg",
]);

type ShopifyAdminClient = {
  graphql: (
    operation: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeFilename(filename: string) {
  const trimmed = filename.trim();
  const sanitized = trimmed.replace(/[^a-zA-Z0-9._-]/g, "-");
  return sanitized.replace(/-+/g, "-");
}

function resolveFilename(imageUrl: string, providedFilename?: string) {
  if (providedFilename?.trim()) {
    return sanitizeFilename(providedFilename);
  }

  try {
    const parsedUrl = new URL(imageUrl);
    const lastSegment = decodeURIComponent(
      parsedUrl.pathname.split("/").filter(Boolean).pop() ?? "",
    );
    const sanitizedSegment = sanitizeFilename(lastSegment);
    const extension = sanitizedSegment.split(".").pop()?.toLowerCase();

    if (sanitizedSegment && extension && KNOWN_IMAGE_EXTENSIONS.has(extension)) {
      return sanitizedSegment;
    }
  } catch (error) {
    console.warn("[Import Image] Could not parse image URL for filename", {
      imageUrl,
      error,
    });
  }

  return `imai-image-${Date.now()}.jpg`;
}

async function fetchImportedFile(
  admin: ShopifyAdminClient,
  fileId: string,
) {
  const response = await admin.graphql(
    `#graphql
    query GetImportedFile($id: ID!) {
      node(id: $id) {
        __typename
        ... on MediaImage {
          id
          fileStatus
          alt
          createdAt
          image {
            url
            width
            height
          }
        }
      }
    }`,
    {
      variables: { id: fileId },
    },
  );

  const jsonResponse = await response.json();
  return jsonResponse.data?.node ?? null;
}

async function waitForImportedFileReady(
  admin: ShopifyAdminClient,
  fileId: string,
  maxAttempts = 6,
  delayMs = 1500,
) {
  let latestFile: Record<string, unknown> | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    latestFile = await fetchImportedFile(admin, fileId);
    const fileStatus =
      typeof latestFile?.fileStatus === "string" ? latestFile.fileStatus : null;

    console.log("[Import Image] Polled Shopify file status", {
      fileId,
      attempt,
      fileStatus,
      imageUrl:
        latestFile &&
        typeof latestFile === "object" &&
        "image" in latestFile &&
        latestFile.image &&
        typeof latestFile.image === "object" &&
        "url" in latestFile.image
          ? latestFile.image.url
          : null,
    });

    if (!fileStatus || !PENDING_FILE_STATUSES.has(fileStatus)) {
      return latestFile;
    }

    if (attempt < maxAttempts) {
      await sleep(delayMs);
    }
  }

  return latestFile;
}

export async function action({ request }: ActionFunctionArgs) {
  const { admin } = await authenticate.admin(request);

  try {
    const body = await request.json();
    const { imageUrl, altText, filename: providedFilename } = body as {
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

    const filename = resolveFilename(imageUrl, providedFilename);

    console.log("[Import Image] Starting import", {
      imageUrl,
      filename,
      altText: altText ?? null,
    });

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
              alt: altText ?? "Image from IMAI.Studio",
              contentType: "IMAGE",
              originalSource: imageUrl,
              filename: filename,
            },
          ],
        },
      }
    );

    const jsonResponse = await response.json();
    const payload = jsonResponse.data?.fileCreate;

    if (!payload?.files?.length) {
      console.error("[Import Image] fileCreate returned no files", {
        response: jsonResponse,
      });
      return Response.json(
        {
          ok: false,
          errors: [
            {
              field: "general",
              message: "Shopify did not return a created file record.",
            },
          ],
        },
        { status: 502 },
      );
    }

    if (payload.userErrors?.length) {
      console.error("[Import Image] fileCreate returned user errors", {
        errors: payload.userErrors,
      });
      return Response.json(
        { ok: false, errors: payload.userErrors },
        { status: 400 },
      );
    }

    const createdFile = payload.files[0];
    console.log("[Import Image] fileCreate accepted import", {
      fileId: createdFile.id,
      fileStatus: createdFile.fileStatus,
    });

    const resolvedFile =
      typeof createdFile.id === "string"
        ? await waitForImportedFileReady(admin, createdFile.id)
        : null;

    const finalFile =
      resolvedFile && typeof resolvedFile === "object" ? resolvedFile : createdFile;
    const finalStatus =
      typeof finalFile.fileStatus === "string" ? finalFile.fileStatus : null;

    console.log("[Import Image] Final Shopify file state", {
      fileId: finalFile.id,
      fileStatus: finalStatus,
    });

    if (finalStatus === FAILED_FILE_STATUS) {
      return Response.json(
        {
          ok: false,
          errors: [
            {
              field: "general",
              message: "Shopify failed to process the imported image.",
            },
          ],
        },
        { status: 502 },
      );
    }

    const isPending =
      !!finalStatus &&
      finalStatus !== READY_FILE_STATUS &&
      PENDING_FILE_STATUSES.has(finalStatus);

    return Response.json({
      ok: true,
      pending: isPending,
      message: isPending
        ? "Image import started. Shopify is still processing the file."
        : "Image imported to Shopify Files.",
      file: finalFile,
    });
  } catch (error) {
    console.error("[Import Image] Unexpected error importing image", error);
    return Response.json(
      { ok: false, errors: [{ field: "general", message: "Failed to import image" }] },
      { status: 500 }
    );
  }
}
