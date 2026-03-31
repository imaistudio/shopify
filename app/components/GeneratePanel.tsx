import { useCallback, useEffect, useRef, useState } from "react";
import {
  BlockStack,
  Box,
  Button,
  Card,
  DropZone,
  Icon,
  InlineGrid,
  InlineStack,
  Spinner,
  Text,
  TextField,
  Thumbnail,
} from "@shopify/polaris";
import { PlusIcon, XCircleIcon } from "@shopify/polaris-icons";

const placeholderStarIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="2.75em" height="2.75em" viewBox="0 0 24 24">
    <path
      fill="#7b61ff"
      stroke="#7b61ff"
      strokeLinejoin="round"
      strokeWidth="1.5"
      d="M3 12c6.268 0 9-2.637 9-9c0 6.363 2.713 9 9 9c-6.287 0-9 2.713-9 9c0-6.287-2.732-9-9-9Z"
    />
  </svg>
);

interface Generation {
  id: string;
  prompt: string;
  uploadedFile: File | null;
  previewUrl: string | null;
  isGenerating: boolean;
  jobId: string | null;
  results: string[] | null;
  error: string | null;
  status: "queued" | "processing" | "completed" | "failed" | "cancelled";
  createdAt: number;
}

interface GeneratePanelProps {
  onGenerationComplete: () => void;
  balance: number | null;
  promptPlaceholder?: string;
  promptHelpText?: string;
}

type ActiveJobsResponse = {
  jobs?: Array<{
    jobId: string;
    prompt: string;
    status:
      | "queued"
      | "running"
      | "processing"
      | "completed"
      | "failed"
      | "cancelled";
    createdAt?: string;
    error?: string | null;
  }>;
};

type StatusResponse = {
  status?:
    | "queued"
    | "running"
    | "processing"
    | "completed"
    | "failed"
    | "cancelled";
  error?: string;
  result?: {
    urls?: string[];
  } & Record<string, unknown>;
  job?: {
    status?:
      | "queued"
      | "running"
      | "processing"
      | "completed"
      | "failed"
      | "cancelled";
    error?: string;
    result?: {
      urls?: string[];
    } & Record<string, unknown>;
  };
};

const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 180;
const CANCEL_BUTTON_TIMEOUT_MS = 60000;

const DEFAULT_PROMPT_PLACEHOLDER =
  "Describe your ideal images — e.g. “4 lifestyle shots on a white background” or “hero banner with model wearing the product”";

function normalizeStatus(
  status:
    | "queued"
    | "running"
    | "processing"
    | "completed"
    | "failed"
    | "cancelled",
): Generation["status"] {
  return status === "running" ? "processing" : status;
}

function parseResultUrls(data: StatusResponse): string[] | null {
  const result = data.result ?? data.job?.result;
  return Array.isArray(result?.urls) ? result.urls : null;
}

export function GeneratePanel({
  onGenerationComplete,
  balance,
  promptPlaceholder,
  promptHelpText,
}: GeneratePanelProps) {
  const [prompt, setPrompt] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showCancelButton, setShowCancelButton] = useState(false);

  const activeJobIdsRef = useRef<Set<string>>(new Set());
  const pollCountRef = useRef(0);

  useEffect(() => {
    activeJobIdsRef.current = new Set(
      generations
        .filter((generation) => generation.isGenerating && generation.jobId)
        .map((generation) => generation.jobId!),
    );
  }, [generations]);

  const hasActiveGeneration = generations.some(
    (generation) => generation.isGenerating,
  );

  const updateGenerationStatus = useCallback(
    (jobId: string, updates: Partial<Generation>) => {
      setGenerations((previous) =>
        previous.map((generation) =>
          generation.jobId === jobId
            ? { ...generation, ...updates }
            : generation,
        ),
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
          const existingJobIds = new Set(
            previous.map((generation) => generation.jobId),
          );
          const restored = jobs
            .filter((job) => !existingJobIds.has(job.jobId))
            .map<Generation>((job) => ({
              id: `restored-${job.jobId}`,
              prompt: job.prompt,
              uploadedFile: null,
              previewUrl: null,
              isGenerating:
                job.status === "queued" ||
                job.status === "running" ||
                job.status === "processing",
              jobId: job.jobId,
              results: null,
              error: job.error ?? null,
              status: normalizeStatus(job.status),
              createdAt: job.createdAt
                ? new Date(job.createdAt).getTime()
                : Date.now(),
            }));

          return [...restored, ...previous];
        });
      } catch (loadError) {
        console.error("Failed to restore active jobs:", loadError);
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
            updateGenerationStatus(jobId, {
              isGenerating: false,
              status: "completed",
              results: parseResultUrls(data),
              error: null,
            });
            activeJobIdsRef.current.delete(jobId);
            setShowCancelButton(false);
            onGenerationComplete();
          } else if (status === "failed" || status === "cancelled") {
            updateGenerationStatus(jobId, {
              isGenerating: false,
              status: status,
              results: null,
              error:
                data.job?.error ??
                data.error ??
                "Generation failed. Please try again.",
            });
            activeJobIdsRef.current.delete(jobId);
            setShowCancelButton(false);
          } else if (status === "running" || status === "processing") {
            updateGenerationStatus(jobId, { status: "processing" });
          }
        } catch (pollError) {
          console.error(`Failed to poll status for ${jobId}:`, pollError);
        }
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [hasActiveGeneration, onGenerationComplete, updateGenerationStatus]);

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
      console.error("Upload failed:", uploadError);
      setError("Image upload failed. Try a JPG or PNG under 10MB.");
      return null;
    } finally {
      setIsUploading(false);
    }
  }, [uploadedFile]);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return;
    if (!uploadedFile) {
      setError("Please upload an image first");
      return;
    }
    if (hasActiveGeneration) {
      setError("Please wait for the current generation to complete");
      return;
    }

    const generationId = Date.now().toString();
    const newGeneration: Generation = {
      id: generationId,
      prompt: prompt.trim(),
      uploadedFile,
      previewUrl,
      isGenerating: true,
      jobId: null,
      results: null,
      error: null,
      status: "queued",
      createdAt: Date.now(),
    };

    setGenerations((previous) => [newGeneration, ...previous]);
    setError(null);

    try {
      const imageUrl = await uploadImage();
      if (!imageUrl) {
        updateGenerationStatus(generationId, {
          isGenerating: false,
          status: "failed",
          error: "Upload failed",
        });
        return;
      }

      const response = await fetch("/api/imai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          url: imageUrl,
          mode: "marketing",
        }),
      });

      if (!response.ok) {
        throw new Error("Generation request failed");
      }

      const data = (await response.json()) as {
        jobId?: string;
        result?: {
          urls?: string[];
        };
      };

      if (data.jobId) {
        updateGenerationStatus(generationId, {
          jobId: data.jobId,
          status: "queued",
        });
      } else {
        updateGenerationStatus(generationId, {
          isGenerating: false,
          status: "completed",
          results: Array.isArray(data.result?.urls) ? data.result.urls : [],
        });
        onGenerationComplete();
      }
    } catch (generationError) {
      console.error("Generation failed:", generationError);
      updateGenerationStatus(generationId, {
        isGenerating: false,
        status: "failed",
        error: "Failed to generate, please try again later.",
      });
      setError("Failed to generate, please try again later.");
    } finally {
      setPrompt("");
      setUploadedFile(null);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(null);
    }
  }, [
    hasActiveGeneration,
    onGenerationComplete,
    previewUrl,
    prompt,
    updateGenerationStatus,
    uploadImage,
    uploadedFile,
  ]);

  const handleCancelGeneration = useCallback(async () => {
    const activeGeneration = generations.find(
      (generation) => generation.isGenerating && generation.jobId,
    );
    if (!activeGeneration?.jobId) return;

    try {
      await fetch("/api/imai/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: activeGeneration.jobId }),
      });
    } catch (cancelError) {
      console.error("Failed to cancel generation:", cancelError);
    }

    updateGenerationStatus(activeGeneration.jobId, {
      isGenerating: false,
      status: "cancelled",
      error: "Generation was cancelled",
      results: null,
    });
    activeJobIdsRef.current.delete(activeGeneration.jobId);
    setShowCancelButton(false);
  }, [generations, updateGenerationStatus]);

  return (
    <BlockStack gap="400">
      {error ? (
        <Card>
          <Box padding="300">
            <Text as="p" tone="critical">
              {error}
            </Text>
          </Box>
        </Card>
      ) : null}

      <Box padding="400">
        <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
          <BlockStack gap="400">
            {hasActiveGeneration ? (
              <Box
                background="bg-fill-secondary"
                padding="800"
                borderRadius="200"
                minHeight="500px"
              >
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
                      Generating your images...
                    </Text>
                    {showCancelButton ? (
                      <Button
                        variant="plain"
                        tone="critical"
                        size="micro"
                        onClick={handleCancelGeneration}
                      >
                        Cancel Generation
                      </Button>
                    ) : null}
                  </BlockStack>
                </div>
              </Box>
            ) : generations.length === 0 ? (
              <Box
                background="bg-fill-secondary"
                padding="800"
                borderRadius="200"
                minHeight="500px"
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: "400px",
                    width: "100%",
                  }}
                >
                  <Icon source={placeholderStarIcon} />
                </div>
              </Box>
            ) : (
              generations.map((generation) => (
                <Card key={generation.id}>
                  <Box padding="400">
                    <BlockStack gap="300">
                      <Text as="p" variant="headingSm">
                        Prompt
                      </Text>
                      <Text as="p">{generation.prompt}</Text>

                      {generation.isGenerating ? (
                        <InlineStack gap="200" blockAlign="center">
                          <Spinner size="small" />
                          <Text as="p" tone="subdued">
                            {generation.status === "processing"
                              ? "Processing your images..."
                              : "Queued for generation..."}
                          </Text>
                        </InlineStack>
                      ) : generation.status === "failed" || generation.error ? (
                        <InlineStack gap="200" blockAlign="center">
                          <Icon source={XCircleIcon} tone="critical" />
                          <Text as="p" tone="critical">
                            {generation.error ??
                              "Failed to generate, please try again later."}
                          </Text>
                        </InlineStack>
                      ) : generation.status === "cancelled" ? (
                        <Text as="p" tone="subdued">
                          Generation was cancelled.
                        </Text>
                      ) : generation.results?.length ? (
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(2, 1fr)",
                            gap: "8px",
                          }}
                        >
                          {generation.results.map((imageUrl, index) => (
                            <div
                              key={`${generation.id}-${index}`}
                              style={{
                                aspectRatio: "1 / 1",
                                overflow: "hidden",
                                borderRadius: "8px",
                              }}
                            >
                              <img
                                src={imageUrl}
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
                      ) : (
                        <Text as="p" tone="subdued">
                          Waiting for results.
                        </Text>
                      )}
                    </BlockStack>
                  </Box>
                </Card>
              ))
            )}
          </BlockStack>

          <BlockStack gap="400">
            <TextField
              label="What do you want to generate?"
              multiline={4}
              placeholder={promptPlaceholder ?? DEFAULT_PROMPT_PLACEHOLDER}
              value={prompt}
              onChange={setPrompt}
              autoComplete="off"
              disabled={hasActiveGeneration}
              helpText={promptHelpText}
            />

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
                  <Thumbnail
                    source={previewUrl || ""}
                    size="small"
                    alt="Reference"
                  />
                  <Text as="p">{uploadedFile.name}</Text>
                  <Button
                    variant="plain"
                    tone="critical"
                    onClick={clearImage}
                    disabled={hasActiveGeneration}
                  >
                    Remove
                  </Button>
                </InlineStack>
              )}
            </BlockStack>

            <Button
              variant="primary"
              size="large"
              fullWidth
              disabled={
                !prompt.trim() ||
                !uploadedFile ||
                isUploading ||
                hasActiveGeneration
              }
              onClick={handleGenerate}
            >
              Generate
            </Button>

            {balance !== null ? (
              <Text as="p" alignment="center" tone="subdued">
                Credits remaining: {Math.round(balance)}
              </Text>
            ) : null}
          </BlockStack>
        </InlineGrid>
      </Box>
    </BlockStack>
  );
}
