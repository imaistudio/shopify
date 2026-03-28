import { useCallback, useEffect, useRef, useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { decrypt } from "../lib/encryption.server";
import {
  BlockStack,
  Box,
  Button,
  Card,
  DropZone,
  Icon,
  InlineGrid,
  InlineStack,
  Page,
  Spinner,
  Text,
  TextField,
  Thumbnail,
} from "@shopify/polaris";
import { ImageIcon, PlusIcon, XCircleIcon } from "@shopify/polaris-icons";
import { ApiKeyEmptyState } from "../components/ApiKeyEmptyState";
import { History } from "../components/History";

type ProductDetails = {
  title?: string;
  description?: string;
  features?: string[];
  specifications?: Record<string, string | number | boolean>;
  platforms?: Record<
    string,
    {
      title?: string;
      description?: string;
      metadata?: {
        features?: string[];
      };
    }
  >;
};

type EcommerceResponse = {
  urls?: string[];
  text?: string;
  details?: ProductDetails;
  images?: {
    urls?: string[];
  };
} & Record<string, unknown>;

interface ProductGeneration {
  id: string;
  prompt: string;
  uploadedFile: File | null;
  previewUrl: string | null;
  isGenerating: boolean;
  jobId: string | null;
  response: EcommerceResponse | null;
  error: string | null;
  status: "queued" | "processing" | "completed" | "failed" | "cancelled";
  createdAt: number;
}

type ActiveJobsResponse = {
  jobs?: Array<{
    jobId: string;
    prompt: string;
    status: "queued" | "running" | "processing" | "completed" | "failed" | "cancelled";
    createdAt?: string;
    error?: string | null;
  }>;
};

type StatusResponse = {
  status?: "queued" | "running" | "processing" | "completed" | "failed" | "cancelled";
  error?: string;
  result?: EcommerceResponse;
  job?: {
    status?: "queued" | "running" | "processing" | "completed" | "failed" | "cancelled";
    error?: string;
    result?: EcommerceResponse;
  };
};

const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 180;
const CANCEL_BUTTON_TIMEOUT_MS = 60000;

const productMasonryColumns = [
  [
    { src: "/block2/1.webp", alt: "Product Agent sample 1" },
    { src: "/block2/5.webp", alt: "Product Agent sample 5" },
  ],
  [
    { src: "/block2/2.webp", alt: "Product Agent sample 2" },
    { src: "/block2/6.webp", alt: "Product Agent sample 6" },
  ],
  [
    { src: "/block2/3.webp", alt: "Product Agent sample 3" },
    { src: "/block2/7.webp", alt: "Product Agent sample 7" },
  ],
  [{ src: "/block2/4.webp", alt: "Product Agent sample 4" }],
] as const;

function normalizeStatus(
  status: "queued" | "running" | "processing" | "completed" | "failed" | "cancelled",
): ProductGeneration["status"] {
  return status === "running" ? "processing" : status;
}

function parseResponse(data: StatusResponse): EcommerceResponse | null {
  return data.result ?? data.job?.result ?? null;
}

function parseTextDetails(response: EcommerceResponse | null): ProductDetails | null {
  if (response?.details) return response.details;
  if (!response?.text) return null;

  try {
    return JSON.parse(response.text) as ProductDetails;
  } catch {
    return { description: response.text };
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const storedKey = await prisma.apiKey.findUnique({
    where: { shop: session.shop },
  });

  let balance = null;
  let hasHistory = false;

  if (storedKey) {
    try {
      const apiKey = decrypt(storedKey.encryptedKey);
      const creditsResp = await fetch("https://www.imai.studio/api/v1/credits", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (creditsResp.ok) {
        const creditsData = await creditsResp.json();
        balance = creditsData.balance;
      }
    } catch (error) {
      console.error("Failed to fetch balance:", error);
    }

    const existingHistory = await prisma.imaiJob.findFirst({
      where: {
        shop: session.shop,
        status: "completed",
        endpoint: "ecommerce",
      },
      select: { id: true },
    });

    hasHistory = !!existingHistory;
  }

  return {
    isConnected: !!storedKey,
    balance,
    hasHistory,
  };
};

export default function ProductGenPage() {
  const {
    isConnected,
    balance,
    hasHistory: initialHasHistory,
  } = useLoaderData<typeof loader>();

  const [prompt, setPrompt] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [generations, setGenerations] = useState<ProductGeneration[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showCancelButton, setShowCancelButton] = useState(false);
  const [hasPageHistory, setHasPageHistory] = useState(initialHasHistory);

  const activeJobIdsRef = useRef<Set<string>>(new Set());
  const pollCountRef = useRef(0);

  useEffect(() => {
    activeJobIdsRef.current = new Set(
      generations.filter((generation) => generation.isGenerating && generation.jobId).map((generation) => generation.jobId!),
    );
  }, [generations]);

  const hasActiveGeneration = generations.some((generation) => generation.isGenerating);

  const updateGeneration = useCallback(
    (match: { id?: string; jobId?: string }, updates: Partial<ProductGeneration>) => {
      setGenerations((previous) =>
        previous.map((generation) => {
          const matchesId = match.id ? generation.id === match.id : false;
          const matchesJobId = match.jobId ? generation.jobId === match.jobId : false;
          return matchesId || matchesJobId ? { ...generation, ...updates } : generation;
        }),
      );
    },
    [],
  );

  useEffect(() => {
    const loadActiveJobs = async () => {
      try {
        const response = await fetch("/api/imai/active-jobs");
        if (!response.ok) return;

        const data = (await response.json()) as ActiveJobsResponse;
        const jobs = data.jobs ?? [];
        if (!jobs.length) return;

        setGenerations((previous) => {
          const existingJobIds = new Set(previous.map((generation) => generation.jobId));
          const restored = jobs
            .filter((job) => !existingJobIds.has(job.jobId))
            .map<ProductGeneration>((job) => ({
              id: `restored-${job.jobId}`,
              prompt: job.prompt,
              uploadedFile: null,
              previewUrl: null,
              isGenerating: job.status === "queued" || job.status === "running" || job.status === "processing",
              jobId: job.jobId,
              response: null,
              error: job.error ?? null,
              status: normalizeStatus(job.status),
              createdAt: job.createdAt ? new Date(job.createdAt).getTime() : Date.now(),
            }));

          return [...restored, ...previous];
        });
      } catch (loadError) {
        console.error("Failed to restore active product jobs:", loadError);
      }
    };

    loadActiveJobs();
  }, []);

  useEffect(() => {
    if (!hasActiveGeneration) {
      pollCountRef.current = 0;
      return;
    }

    const intervalId = setInterval(async () => {
      const activeJobIds = Array.from(activeJobIdsRef.current);
      if (!activeJobIds.length) {
        clearInterval(intervalId);
        return;
      }

      if (pollCountRef.current >= MAX_POLL_ATTEMPTS) {
        setGenerations((previous) =>
          previous.map((generation) =>
            generation.isGenerating
              ? {
                  ...generation,
                  isGenerating: false,
                  status: "failed",
                  error: "Generation timed out. Please try again.",
                }
              : generation,
          ),
        );
        setShowCancelButton(false);
        pollCountRef.current = 0;
        clearInterval(intervalId);
        return;
      }

      pollCountRef.current += 1;

      for (const jobId of activeJobIds) {
        try {
          const response = await fetch(`/api/imai/status?jobId=${jobId}`);
          if (!response.ok) continue;

          const data = (await response.json()) as StatusResponse;
          const status = data.job?.status ?? data.status;

          if (status === "completed") {
            updateGeneration(
              { jobId },
              {
                isGenerating: false,
                status: "completed",
                response: parseResponse(data),
                error: null,
              },
            );
            activeJobIdsRef.current.delete(jobId);
            setShowCancelButton(false);
          } else if (status === "failed" || status === "cancelled") {
            updateGeneration(
              { jobId },
              {
                isGenerating: false,
                status,
                response: null,
                error: data.job?.error ?? data.error ?? "Generation failed. Please try again.",
              },
            );
            activeJobIdsRef.current.delete(jobId);
            setShowCancelButton(false);
          } else if (status === "running" || status === "processing") {
            updateGeneration({ jobId }, { status: "processing" });
          }
        } catch (pollError) {
          console.error(`Failed to poll product status for ${jobId}:`, pollError);
        }
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [hasActiveGeneration, updateGeneration]);

  useEffect(() => {
    if (!hasActiveGeneration) {
      setShowCancelButton(false);
      return;
    }

    const timeoutId = setTimeout(() => {
      setShowCancelButton(true);
    }, CANCEL_BUTTON_TIMEOUT_MS);

    return () => clearTimeout(timeoutId);
  }, [hasActiveGeneration]);

  const handleDrop = useCallback((files: File[]) => {
    const file = files[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setError("File too large. Maximum size is 10MB.");
      return;
    }

    setUploadedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setError(null);
  }, []);

  const clearImage = useCallback(() => {
    setUploadedFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
  }, [previewUrl]);

  const uploadImage = useCallback(async (): Promise<string | null> => {
    if (!uploadedFile) return null;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", uploadedFile);

      const response = await fetch("/api/imai/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      const data = (await response.json()) as { publicUrl?: string };
      return data.publicUrl ?? null;
    } catch (uploadError) {
      console.error("Product upload failed:", uploadError);
      setError("Image upload failed. Try a JPG or PNG under 10MB.");
      return null;
    } finally {
      setIsUploading(false);
    }
  }, [uploadedFile]);

  const handleGenerate = useCallback(async () => {
    if (!uploadedFile) {
      setError("Please upload an image first.");
      return;
    }
    if (hasActiveGeneration) {
      setError("Please wait for the current generation to complete.");
      return;
    }

    const generationId = Date.now().toString();
    setGenerations((previous) => [
      {
        id: generationId,
        prompt: prompt.trim(),
        uploadedFile,
        previewUrl,
        isGenerating: true,
        jobId: null,
        response: null,
        error: null,
        status: "queued",
        createdAt: Date.now(),
      },
      ...previous,
    ]);
    setError(null);

    try {
      const imageUrl = await uploadImage();
      if (!imageUrl) {
        updateGeneration(
          { id: generationId },
          {
            isGenerating: false,
            status: "failed",
            error: "Upload failed.",
          },
        );
        return;
      }

      const response = await fetch("/api/imai/generate/ecommerce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          url: imageUrl,
        }),
      });

      if (!response.ok) {
        throw new Error("Generation request failed");
      }

      const data = (await response.json()) as {
        jobId?: string;
        success?: boolean;
      } & EcommerceResponse;

      if (data.jobId) {
        updateGeneration(
          { id: generationId },
          {
            jobId: data.jobId,
            status: "queued",
          },
        );
      } else {
        updateGeneration(
          { id: generationId },
          {
            isGenerating: false,
            status: "completed",
            response: data,
            error: null,
          },
        );
      }
    } catch (generationError) {
      console.error("Product generation failed:", generationError);
      updateGeneration(
        { id: generationId },
        {
          isGenerating: false,
          status: "failed",
          error: "Failed to generate, please try again later.",
        },
      );
      setError("Failed to generate, please try again later.");
    } finally {
      setPrompt("");
      setUploadedFile(null);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(null);
    }
  }, [hasActiveGeneration, previewUrl, prompt, updateGeneration, uploadImage, uploadedFile]);

  const handleCancelGeneration = useCallback(async () => {
    const activeGeneration = generations.find((generation) => generation.isGenerating && generation.jobId);
    if (!activeGeneration?.jobId) return;

    try {
      await fetch("/api/imai/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: activeGeneration.jobId }),
      });
    } catch (cancelError) {
      console.error("Failed to cancel product generation:", cancelError);
    }

    updateGeneration(
      { jobId: activeGeneration.jobId },
      {
        isGenerating: false,
        status: "cancelled",
        response: null,
        error: "Generation was cancelled.",
      },
    );
    activeJobIdsRef.current.delete(activeGeneration.jobId);
    setShowCancelButton(false);
  }, [generations, updateGeneration]);

  const handleHistoryVisibilityChange = useCallback((hasVisibleHistory: boolean) => {
    setHasPageHistory(hasVisibleHistory);
  }, []);

  if (!isConnected) {
    return (
      <Page title="Product Agent">
        <ApiKeyEmptyState
          bannerText="Connect your API key in the Settings tab to start generating product content with the Product Agent."
          emptyText="Connect your API key to view Product Agent content"
        />
      </Page>
    );
  }

  return (
    <Page title="Product Agent">
      <style>{`
        .product-masonry {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 16px;
          align-items: start;
        }

        .product-masonry-column {
          display: grid;
          gap: 16px;
          align-content: start;
        }

        .product-masonry-image {
          width: 100%;
          height: auto;
          display: block;
          border-radius: 16px;
        }

        @media (max-width: 1024px) {
          .product-masonry {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 640px) {
          .product-masonry {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <BlockStack gap="400">
        <div style={{ marginTop: "-20px" }}>
          <Box paddingBlockEnd="200">
            <Text as="p" tone="subdued">
              Use the Product Agent to turn a reference image into clean catalogue shots and richer product content for your store.
            </Text>
          </Box>
        </div>

        <Card>
          <Box padding="400">
            <img
              src="/product/productgen2.webp"
              alt="Product Agent banner"
              style={{
                width: "100%",
                height: "auto",
                borderRadius: "12px",
                objectFit: "cover",
              }}
            />
          </Box>
        </Card>

        {error ? (
          <Card>
            <Box padding="300">
              <Text as="p" tone="critical">
                {error}
              </Text>
            </Box>
          </Card>
        ) : null}

        <Card>
          <Box padding="400">
            <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
              <BlockStack gap="400">
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd">
                    Reference Image
                  </Text>

                  {!uploadedFile ? (
                    <DropZone
                      accept=".webp,.png,.jpeg,.jpg"
                      type="image"
                      onDrop={handleDrop}
                      allowMultiple={false}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          minHeight: "200px",
                          width: "100%",
                          padding: "16px",
                        }}
                      >
                        <div
                          style={{
                            display: "inline-flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          <Icon source={PlusIcon} tone="subdued" />
                          <span
                            style={{
                              fontSize: "13px",
                              color: "var(--p-color-text-subdued)",
                              lineHeight: 1.3,
                            }}
                          >
                            Drop or click to upload
                          </span>
                        </div>
                      </div>
                    </DropZone>
                  ) : (
                    <InlineStack gap="200" blockAlign="center">
                      <Thumbnail source={previewUrl || ""} size="small" alt="Reference" />
                      <Text as="p">{uploadedFile.name}</Text>
                      <Button variant="plain" tone="critical" onClick={clearImage}>
                        Remove
                      </Button>
                    </InlineStack>
                  )}
                </BlockStack>

                <TextField
                  label="Agent Brief (Optional)"
                  value={prompt}
                  onChange={setPrompt}
                  placeholder='e.g. "Clean white background ecommerce shot" or "Luxury product on marble surface"'
                  multiline={3}
                  autoComplete="off"
                  helpText="Add style, mood, or background ideas to guide the Product Agent."
                />

                {balance !== null ? (
                  <Text as="p" tone="subdued">
                    Credits remaining: {Math.round(balance)}
                  </Text>
                ) : null}

                <Button
                  variant="primary"
                  size="large"
                  fullWidth
                  disabled={!uploadedFile || isUploading || hasActiveGeneration}
                  onClick={handleGenerate}
                >
                  Run Product Agent
                </Button>
              </BlockStack>

              <BlockStack gap="400">
                {hasActiveGeneration ? (
                  <Box background="bg-fill-secondary" padding="800" borderRadius="200" minHeight="500px">
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minHeight: "400px",
                        width: "100%",
                        textAlign: "center",
                      }}
                    >
                      <BlockStack gap="200" align="center">
                        <Spinner size="large" />
                        <Text as="p" alignment="center" tone="subdued">
                          Product Agent is generating your content...
                        </Text>
                        {showCancelButton ? (
                          <Button variant="plain" tone="critical" size="micro" onClick={handleCancelGeneration}>
                            Cancel Generation
                          </Button>
                        ) : null}
                      </BlockStack>
                    </div>
                  </Box>
                ) : generations.length === 0 ? (
                  <Box background="bg-fill-secondary" padding="800" borderRadius="200" minHeight="500px">
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minHeight: "400px",
                        width: "100%",
                      }}
                    >
                      <BlockStack gap="200" align="center">
                        <Icon source={ImageIcon} tone="subdued" />
                        <Text as="p" alignment="center" tone="subdued">
                          Generated assets and product details will appear here
                        </Text>
                      </BlockStack>
                    </div>
                  </Box>
                ) : (
                  generations.map((generation) => {
                    const response = generation.response;
                    const details = parseTextDetails(response);
                    const imageUrls = Array.isArray(response?.urls)
                      ? response.urls
                      : Array.isArray(response?.images?.urls)
                        ? response.images.urls
                        : [];

                    return (
                      <Card key={generation.id}>
                        <Box padding="400">
                          <BlockStack gap="300">
                            {generation.prompt ? (
                              <Box>
                                <Text as="h3" variant="headingSm">
                                  Prompt
                                </Text>
                                <Text as="p">{generation.prompt}</Text>
                              </Box>
                            ) : null}

                            {generation.isGenerating ? (
                              <InlineStack gap="200" blockAlign="center">
                                <Spinner size="small" />
                                <Text as="p" tone="subdued">
                                  {generation.status === "processing"
                                    ? "Processing your content..."
                                    : "Queued for generation..."}
                                </Text>
                              </InlineStack>
                            ) : generation.status === "failed" || generation.error ? (
                              <InlineStack gap="200" blockAlign="center">
                                <Icon source={XCircleIcon} tone="critical" />
                                <Text as="p" tone="critical">
                                  {generation.error ?? "Failed to generate, please try again later."}
                                </Text>
                              </InlineStack>
                            ) : generation.status === "cancelled" ? (
                              <Text as="p" tone="subdued">
                                Generation was cancelled.
                              </Text>
                            ) : null}

                            {imageUrls.length ? (
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "repeat(2, 1fr)",
                                  gap: "8px",
                                }}
                              >
                                {imageUrls.slice(0, 4).map((url, index) => (
                                  <div
                                    key={`${generation.id}-${index}`}
                                    style={{
                                      aspectRatio: "1 / 1",
                                      overflow: "hidden",
                                      borderRadius: "8px",
                                    }}
                                  >
                                    <img
                                      src={url}
                                      alt={`Generated ${index + 1}`}
                                      style={{
                                        width: "100%",
                                        height: "100%",
                                        objectFit: "cover",
                                        display: "block",
                                      }}
                                    />
                                  </div>
                                ))}
                              </div>
                            ) : null}

                            {details?.title ? (
                              <Box>
                                <Text as="p" fontWeight="bold">
                                  Title
                                </Text>
                                <Text as="p">{details.title}</Text>
                              </Box>
                            ) : null}

                            {details?.description ? (
                              <Box>
                                <Text as="p" fontWeight="bold">
                                  Description
                                </Text>
                                <Text as="p">{details.description}</Text>
                              </Box>
                            ) : null}

                            {details?.features?.length ? (
                              <Box>
                                <Text as="p" fontWeight="bold">
                                  Features
                                </Text>
                                <BlockStack gap="100">
                                  {details.features.map((feature) => (
                                    <Text as="p" key={feature} variant="bodySm">
                                      {feature}
                                    </Text>
                                  ))}
                                </BlockStack>
                              </Box>
                            ) : null}

                            {details?.specifications && Object.keys(details.specifications).length ? (
                              <Box>
                                <Text as="p" fontWeight="bold">
                                  Specifications
                                </Text>
                                <BlockStack gap="100">
                                  {Object.entries(details.specifications).map(([key, value]) => (
                                    <Text as="p" key={key} variant="bodySm">
                                      {key}: {String(value)}
                                    </Text>
                                  ))}
                                </BlockStack>
                              </Box>
                            ) : null}

                            {details?.platforms && Object.keys(details.platforms).length ? (
                              <Box>
                                <Text as="p" fontWeight="bold">
                                  Platform Content
                                </Text>
                                <BlockStack gap="200">
                                  {Object.entries(details.platforms).map(([platform, content]) => (
                                    <Card key={platform}>
                                      <Box padding="300">
                                        <BlockStack gap="100">
                                          <Text as="p" fontWeight="bold" tone="subdued">
                                            {platform}
                                          </Text>
                                          {content.title ? <Text as="p">{content.title}</Text> : null}
                                          {content.description ? (
                                            <Text as="p" variant="bodySm">
                                              {content.description}
                                            </Text>
                                          ) : null}
                                        </BlockStack>
                                      </Box>
                                    </Card>
                                  ))}
                                </BlockStack>
                              </Box>
                            ) : null}
                          </BlockStack>
                        </Box>
                      </Card>
                    );
                  })
                )}
              </BlockStack>
            </InlineGrid>
          </Box>
        </Card>

        {!hasPageHistory ? (
          <Card>
            <Box padding="400">
              <div className="product-masonry">
                {productMasonryColumns.map((column, columnIndex) => (
                  <div className="product-masonry-column" key={`product-column-${columnIndex}`}>
                    {column.map((image) => (
                      <img
                        key={image.src}
                        className="product-masonry-image"
                        src={image.src}
                        alt={image.alt}
                        loading="lazy"
                      />
                    ))}
                  </div>
                ))}
              </div>
            </Box>
          </Card>
        ) : null}

        <History
          endpoint="ecommerce"
          onHasVisibleHistoryChange={handleHistoryVisibilityChange}
          showLoadingState={hasPageHistory}
        />
      </BlockStack>
    </Page>
  );
}
