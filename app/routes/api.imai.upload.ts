import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

const PENDING_FILE_STATUSES = new Set(["UPLOADED", "PROCESSING"]);
const READY_FILE_STATUS = "READY";
const FAILED_FILE_STATUS = "FAILED";

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
  const trimmed = filename.trim() || `imai-reference-${Date.now()}`;
  const sanitized = trimmed.replace(/[^a-zA-Z0-9._-]/g, "-");
  return sanitized.replace(/-+/g, "-");
}

function getImageExtension(mimeType: string) {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "jpg";
  }
}

function resolveUploadFilename(image: File) {
  const sanitized = sanitizeFilename(image.name);
  if (sanitized.includes(".")) return sanitized;

  return `${sanitized}.${getImageExtension(image.type)}`;
}

async function fetchImportedFile(admin: ShopifyAdminClient, fileId: string) {
  const response = await admin.graphql(
    `#graphql
    query GetUploadedReferenceImage($id: ID!) {
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
  maxAttempts = 10,
  delayMs = 1500,
) {
  let latestFile: Record<string, unknown> | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    latestFile = await fetchImportedFile(admin, fileId);
    const fileStatus =
      typeof latestFile?.fileStatus === "string" ? latestFile.fileStatus : null;
    const imageUrl =
      latestFile &&
      typeof latestFile === "object" &&
      "image" in latestFile &&
      latestFile.image &&
      typeof latestFile.image === "object" &&
      "url" in latestFile.image &&
      typeof latestFile.image.url === "string"
        ? latestFile.image.url
        : null;

    if (fileStatus === READY_FILE_STATUS && imageUrl) {
      return latestFile;
    }

    if (!fileStatus || fileStatus === FAILED_FILE_STATUS) {
      return latestFile;
    }

    if (!PENDING_FILE_STATUSES.has(fileStatus)) {
      return latestFile;
    }

    if (attempt < maxAttempts) {
      await sleep(delayMs);
    }
  }

  return latestFile;
}

function getMediaImageUrl(file: Record<string, unknown> | null) {
  if (
    file &&
    typeof file === "object" &&
    "image" in file &&
    file.image &&
    typeof file.image === "object" &&
    "url" in file.image &&
    typeof file.image.url === "string"
  ) {
    return file.image.url;
  }

  return null;
}

/**
 * POST /api/imai/upload
 * Accepts an image file, stores it in Shopify Files, and returns a public URL.
 * The image can then be used as a reference for generation
 */
export async function action({ request }: ActionFunctionArgs) {
  const { admin } = await authenticate.admin(request);
  
  const formData = await request.formData();
  const image = formData.get("image") as File | null;

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

  try {
    const filename = resolveUploadFilename(image);
    const stagedUploadResponse = await admin.graphql(
      `#graphql
      mutation CreateReferenceImageStagedUpload($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets {
            url
            resourceUrl
            parameters {
              name
              value
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
          input: [
            {
              resource: "FILE",
              filename,
              mimeType: image.type,
              httpMethod: "POST",
            },
          ],
        },
      },
    );

    const stagedUploadJson = await stagedUploadResponse.json();
    const stagedPayload = stagedUploadJson.data?.stagedUploadsCreate;
    const stagedUploadErrors = stagedPayload?.userErrors ?? [];

    if (stagedUploadErrors.length) {
      console.error("[IMAI Upload] stagedUploadsCreate returned errors", {
        errors: stagedUploadErrors,
      });
      return Response.json(
        { error: "Shopify could not prepare the image upload." },
        { status: 400 },
      );
    }

    const stagedTarget = stagedPayload?.stagedTargets?.[0];

    if (!stagedTarget?.url || !stagedTarget?.resourceUrl) {
      console.error("[IMAI Upload] Missing staged upload target", {
        response: stagedUploadJson,
      });
      return Response.json(
        { error: "Shopify did not return an image upload target." },
        { status: 502 },
      );
    }

    const uploadFormData = new FormData();
    for (const parameter of stagedTarget.parameters ?? []) {
      uploadFormData.append(parameter.name, parameter.value);
    }
    uploadFormData.append("file", image, filename);

    const uploadResponse = await fetch(stagedTarget.url, {
      method: "POST",
      body: uploadFormData,
    });

    if (!uploadResponse.ok) {
      console.error("[IMAI Upload] Shopify staged upload failed", {
        status: uploadResponse.status,
        body: await uploadResponse.text().catch(() => ""),
      });
      return Response.json(
        { error: "Failed to upload image to Shopify Files." },
        { status: 502 },
      );
    }

    const createFileResponse = await admin.graphql(
      `#graphql
      mutation CreateReferenceImageFile($files: [FileCreateInput!]!) {
        fileCreate(files: $files) {
          files {
            id
            fileStatus
            alt
            createdAt
            ... on MediaImage {
              image {
                url
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
              alt: "Reference image for IMAI.Studio generation",
              contentType: "IMAGE",
              originalSource: stagedTarget.resourceUrl,
              filename,
            },
          ],
        },
      },
    );

    const createFileJson = await createFileResponse.json();
    const createFilePayload = createFileJson.data?.fileCreate;
    const createFileErrors = createFilePayload?.userErrors ?? [];

    if (createFileErrors.length) {
      console.error("[IMAI Upload] fileCreate returned errors", {
        errors: createFileErrors,
      });
      return Response.json(
        { error: "Shopify could not create the uploaded image file." },
        { status: 400 },
      );
    }

    const createdFile = createFilePayload?.files?.[0];

    if (!createdFile?.id) {
      console.error("[IMAI Upload] fileCreate returned no file", {
        response: createFileJson,
      });
      return Response.json(
        { error: "Shopify did not return a created image file." },
        { status: 502 },
      );
    }

    const resolvedFile = await waitForImportedFileReady(admin, createdFile.id);
    const finalStatus =
      typeof resolvedFile?.fileStatus === "string"
        ? resolvedFile.fileStatus
        : typeof createdFile.fileStatus === "string"
          ? createdFile.fileStatus
          : null;

    if (finalStatus === FAILED_FILE_STATUS) {
      return Response.json(
        { error: "Shopify failed to process the uploaded image." },
        { status: 502 },
      );
    }

    const publicUrl = getMediaImageUrl(resolvedFile) ?? getMediaImageUrl(createdFile);

    if (!publicUrl) {
      return Response.json(
        { error: "Shopify is still processing the uploaded image. Try again shortly." },
        { status: 503 },
      );
    }

    return Response.json({
      publicUrl,
      success: true,
    });
  } catch (error) {
    console.error("[IMAI Upload] Unexpected upload error:", error);
    return Response.json(
      { error: "Failed to upload image" },
      { status: 500 }
    );
  }
}
