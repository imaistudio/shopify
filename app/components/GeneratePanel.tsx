import { useState, useCallback, useEffect, useMemo } from "react";
import {
  BlockStack,
  Card,
  TextField,
  DropZone,
  Button,
  InlineStack,
  Text,
  Badge,
  Banner,
  Thumbnail,
  Spinner,
  Box,
  Divider,
  InlineGrid,
  RadioButton,
  Icon,
} from "@shopify/polaris";
import { ImageIcon } from "@shopify/polaris-icons";

interface Generation {
  id: string;
  prompt: string;
  uploadedFile: File | null;
  previewUrl: string | null;
  isGenerating: boolean;
  jobId: string | null;
  results: string[] | null;
  error: string | null;
}

interface GeneratePanelProps {
  onGenerationComplete: () => void;
  shop: string;
  defaultMode?: "marketing" | "design";
  balance: number | null;
}

export function GeneratePanel({ onGenerationComplete, shop, defaultMode, balance }: GeneratePanelProps) {
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<"marketing" | "design">(defaultMode || "marketing");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showCancelButton, setShowCancelButton] = useState(false);
  
  // Track if any generation is currently in progress
  const hasActiveGeneration = useMemo(() => 
    generations.some(gen => gen.isGenerating), 
    [generations]
  );


  // Load active (non-completed) jobs from database on mount
  useEffect(() => {
    const loadActiveJobs = async () => {
      try {
        const resp = await fetch('/api/imai/active-jobs');
        if (resp.ok) {
          const data = await resp.json();
          if (data.jobs && data.jobs.length > 0) {
            console.log("Restoring active jobs from database:", data.jobs);
            const activeGenerations = data.jobs.map((job: any) => ({
              id: `restored-${job.jobId}`,
              prompt: job.prompt,
              uploadedFile: null,
              previewUrl: null,
              isGenerating: true,
              jobId: job.jobId,
              results: null,
              error: null,
            }));
            setGenerations(prev => {
              // Avoid duplicates
              const existingJobIds = new Set(prev.map(g => g.jobId));
              const newJobs = activeGenerations.filter((g: Generation) => !existingJobIds.has(g.jobId));
              return [...newJobs, ...prev];
            });
          }
        }
      } catch (error) {
        console.error('Failed to load active jobs:', error);
      }
    };
    loadActiveJobs();
  }, []);

  const handleGenerationComplete = useCallback(
    (generationId: string) => (result: any) => {
      console.log("handleGenerationComplete called for generation:", generationId, "result:", result);
      setGenerations(prev => {
        console.log("Updating generations, prev state:", prev.map(g => ({ id: g.id, isGenerating: g.isGenerating, jobId: g.jobId })));
        const updated = prev.map(gen =>
          gen.id === generationId
            ? { ...gen, isGenerating: !(result.urls && result.urls.length > 0), results: result.urls || [] }
            : gen
        );
        console.log("Updated generations:", updated.map(g => ({ id: g.id, isGenerating: g.isGenerating, hasResults: !!g.results })));
        return updated;
      });
      onGenerationComplete();
    },
    [onGenerationComplete]
  );

  const handleGenerationError = useCallback(
    (generationId: string) => (err: string) => {
      setGenerations(prev => prev.map(gen =>
        gen.id === generationId
          ? { ...gen, isGenerating: false, error: err }
          : gen
      ));
    },
    []
  );

  const jobs = generations
    .filter(gen => gen.jobId && gen.isGenerating)
    .map(gen => ({
      jobId: gen.jobId!,
      onComplete: handleGenerationComplete(gen.id),
      onError: handleGenerationError(gen.id),
    }));

  // Set up SSE event listening for webhook completion
  useEffect(() => {
    const eventSource = new EventSource('/api/imai/events');

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'job_update') {
          const { jobId, status, result, error } = data;

          // Find the generation with this jobId
          const generationIndex = generations.findIndex(gen => gen.jobId === jobId);
          if (generationIndex !== -1) {
            if (status === 'completed') {
              console.log('Job completed via webhook:', jobId);
              setGenerations(prev => prev.map((gen, index) =>
                index === generationIndex
                  ? { ...gen, isGenerating: false, results: result?.urls || [] }
                  : gen
              ));
              setIsGenerating(false);
              setShowCancelButton(false);
              onGenerationComplete();
            } else if (status === 'failed') {
              console.log('Job failed via webhook:', jobId, error);
              setGenerations(prev => prev.map((gen, index) =>
                index === generationIndex
                  ? { ...gen, isGenerating: false, error: error || "Generation failed" }
                  : gen
              ));
              setIsGenerating(false);
              setShowCancelButton(false);
            }
          }
        }
      } catch (err) {
        console.error("Error parsing SSE event:", err);
      }
    };

    eventSource.onerror = (error) => {
      console.error("SSE connection error:", error);
    };

    return () => {
      eventSource.close();
    };
  }, [generations, onGenerationComplete]);

  // Timeout handling for webhook failures
  useEffect(() => {
    if (!hasActiveGeneration) {
      setShowCancelButton(false);
      return;
    }

    // Show cancel button after 2 minutes
    const showCancelTimer = setTimeout(() => {
      setShowCancelButton(true);
    }, 120000); // 2 minutes

    // Auto-cancel after 10 minutes if no webhook arrives
    const autoCancelTimer = setTimeout(() => {
      console.log('Auto-cancelling generation due to timeout');
      setGenerations(prev => prev.map(gen =>
        gen.isGenerating
          ? { ...gen, isGenerating: false }
          : gen
      ));
      setIsGenerating(false);
      setShowCancelButton(false);
    }, 600000); // 10 minutes

    return () => {
      clearTimeout(showCancelTimer);
      clearTimeout(autoCancelTimer);
    };
  }, [hasActiveGeneration]);

  const handleCancelGeneration = useCallback(() => {
    setGenerations(prev => prev.map(gen =>
      gen.isGenerating
        ? { ...gen, isGenerating: false }
        : gen
    ));
    setIsGenerating(false);
    setShowCancelButton(false);
  }, []);

  const handleDrop = async (files: File[]) => {
    if (files.length > 0) {
      const file = files[0];
      if (file.size > 10 * 1024 * 1024) {
        setError("File too large. Maximum size is 10MB.");
        return;
      }
      
      setUploadedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setError(null);
    }
  };

  const clearImage = () => {
    setUploadedFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
  };

  const uploadImage = async (): Promise<string | null> => {
    if (!uploadedFile) return null;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", uploadedFile);
      formData.append("shop", shop);

      const resp = await fetch("/api/imai/upload", {
        method: "POST",
        body: formData,
      });

      if (!resp.ok) {
        throw new Error("Upload failed");
      }

      const data = await resp.json();
      return data.publicUrl;
    } catch (err) {
      setError("Image upload failed. Try a JPG or PNG under 10MB.");
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  const uploadUrlToTempFile = async (url: string): Promise<string> => {
    try {
      const resp = await fetch("https://tempfile.org/api/upload/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url,
          expiryHours: 24,
        }),
      });

      if (!resp.ok) {
        throw new Error("Failed to upload URL to temporary storage");
      }

      const data = await resp.json();
      if (!data.success || !data.file?.url) {
        throw new Error("Invalid response from TempFile API");
      }

      // Append /preview to make the URL directly accessible
      const baseUrl = data.file.url;
      return baseUrl.endsWith('/') ? `${baseUrl}preview` : `${baseUrl}/preview`;
    } catch (error) {
      console.error("TempFile URL upload error:", error);
      throw error;
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    if (!uploadedFile) {
      setError("Please upload an image first");
      return;
    }
    
    // Prevent multiple concurrent generations
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
    };

    setGenerations(prev => [newGeneration, ...prev]);
    setIsGenerating(true);
    setError(null);

    try {
      // Upload the image
      const processedImageUrl = await uploadImage();
      if (!processedImageUrl) {
        setIsGenerating(false);
        setGenerations(prev => prev.map(gen =>
          gen.id === generationId ? { ...gen, isGenerating: false, error: "Upload failed" } : gen
        ));
        return;
      }

      // Call generate API
      const resp = await fetch("/api/imai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          url: processedImageUrl,
          mode,
          shop,
        }),
      });

      if (!resp.ok) {
        throw new Error("Generation request failed");
      }

      const data = await resp.json();
      
      if (data.jobId) {
        setGenerations(prev => prev.map(gen =>
          gen.id === generationId ? { ...gen, jobId: data.jobId } : gen
        ));
      } else if (data.result) {
        // Synchronous response
        setGenerations(prev => prev.map(gen =>
          gen.id === generationId ? { ...gen, isGenerating: false, results: data.result.urls || [] } : gen
        ));
        setIsGenerating(false);
        onGenerationComplete();
      }
    } catch (err) {
      setError("Failed to generate, please try again later.");
      setIsGenerating(false);
      setGenerations(prev => prev.map(gen =>
          gen.id === generationId ? { ...gen, isGenerating: false, error: "Failed to generate, please try again later." } : gen
        ));
    }

    // Clear inputs after starting generation
    setPrompt("");
    setUploadedFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
  };

  return (
    <BlockStack gap="400">
      {error && (
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <Text as="p" tone="critical">Failed to generate, please try again later.</Text>
          <Button onClick={handleGenerate} tone="critical" variant="plain">
            Retry
          </Button>
        </div>
      )}

      <Box padding="400">
        <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
          {/* Left Side */}
          <BlockStack gap="400">
            <TextField
              label="What do you want to generate?"
              multiline={4}
              placeholder="e.g. Generate 3 lifestyle shots on a clean white background..."
              value={prompt}
              onChange={setPrompt}
              autoComplete="off"
              disabled={hasActiveGeneration}
            />

            <BlockStack gap="200">
              <Text variant="bodyMd" as="p">
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
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      minHeight: '200px',
                      width: '100%'
                    }}
                  >
                    <BlockStack gap="200" align="center">
                      <Icon source={ImageIcon} tone="subdued" />
                      <Text as="p" alignment="center" tone="subdued">
                        Drop an image here or click to upload
                      </Text>
                    </BlockStack>
                  </div>
                </DropZone>
              ) : (
                <InlineStack gap="200" blockAlign="center">
                  <Thumbnail source={previewUrl || ""} size="small" alt="Reference" />
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

            {!defaultMode && (
              <BlockStack gap="200">
                <Text as="p" variant="headingSm">Generation Mode</Text>
                <RadioButton
                  label="Marketing Images"
                  helpText="Product shots, lifestyle images, and listing photos"
                  checked={mode === "marketing"}
                  onChange={() => setMode("marketing")}
                  disabled={hasActiveGeneration}
                />
                <RadioButton
                  label="Design Concepts"
                  helpText="Creative concepts and design variations"
                  checked={mode === "design"}
                  onChange={() => setMode("design")}
                  disabled={hasActiveGeneration}
                />
              </BlockStack>
            )}

            {balance !== null && (
              <Text as="p" tone="subdued">
                Credits: {Math.round(balance)}
              </Text>
            )}

            <InlineStack gap="300" blockAlign="center">
              <Button
                variant="primary"
                size="large"
                disabled={!prompt.trim() || !uploadedFile || isUploading || hasActiveGeneration}
                onClick={handleGenerate}
              >
                Generate
              </Button>
            </InlineStack>

            {error && (
              <div style={{ textAlign: 'center', padding: '20px' }}>
                <Text as="p" tone="critical">Failed to generate, please try again later.</Text>
              </div>
            )}
          </BlockStack>

          {/* Right Side */}
          <BlockStack gap="400">
            {hasActiveGeneration ? (
              <Box 
                key="loading-state"
                background="bg-fill-secondary" 
                padding="800" 
                borderRadius="200"
                minHeight="500px"
                borderColor="border"
              >
                <div 
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    minHeight: '400px',
                    width: '100%',
                    textAlign: 'center'
                  }}
                >
                  <BlockStack gap="200" align="center">
                    <Spinner size="large" />
                    <Text as="p" alignment="center" tone="subdued">
                      Generating your images...
                    </Text>
                    {showCancelButton && (
                      <Button
                        variant="plain"
                        tone="critical"
                        size="micro"
                        onClick={handleCancelGeneration}
                      >
                        Cancel Generation
                      </Button>
                    )}
                  </BlockStack>
                </div>
              </Box>
            ) : (
              generations.length === 0 ? (
                <Box 
                  key="empty-state"
                  background="bg-fill-secondary" 
                  padding="800" 
                  borderRadius="200"
                  minHeight="500px"
                  borderColor="border"
                >
                  <div 
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      minHeight: '400px',
                      width: '100%'
                    }}
                  >
                    <BlockStack gap="200" align="center">
                      <Icon source={ImageIcon} tone="subdued" />
                      <Text as="p" alignment="center" tone="subdued">
                        Generated images will appear here
                      </Text>
                    </BlockStack>
                  </div>
                </Box>
              ) : (
                <div key="results-container">
                  {generations.map((gen) => (
                  <Card key={gen.id}>
                    <Box padding="400">
                      <BlockStack gap="400">
                        {gen.prompt && (
                          <Box>
                            <Text variant="headingSm" as="h3">Prompt</Text>
                            <Text as="p">{gen.prompt}</Text>
                          </Box>
                        )}
                        {gen.isGenerating ? (
                          <BlockStack gap="200" align="center">
                            <Text as="p" tone="subdued">Generating...</Text>
                          </BlockStack>
                        ) : gen.error ? (
                          <Text as="p" tone="critical">{gen.error}</Text>
                        ) : gen.results && gen.results.length > 0 ? (
                          <Box>
                            <Text variant="headingSm" as="h3">Generated Images</Text>
                            <div 
                              style={{ 
                                display: 'flex', 
                                flexDirection: 'row', 
                                flexWrap: 'wrap', 
                                gap: '16px',
                                justifyContent: 'center',
                                alignItems: 'center'
                              }}
                            >
                              {gen.results.map((imageUrl: string, index: number) => (
                                <div key={index} style={{ textAlign: 'center' }}>
                                  <img 
                                    src={imageUrl} 
                                    alt={`Generated image ${index + 1}`}
                                    style={{ 
                                      maxWidth: "200px", 
                                      height: "auto", 
                                      borderRadius: "8px",
                                      display: 'block'
                                    }}
                                  />
                                </div>
                              ))}
                            </div>
                          </Box>
                        ) : null}
                      </BlockStack>
                    </Box>
                  </Card>
                ))}
                </div>
            ))}
          </BlockStack>
        </InlineGrid>
      </Box>
    </BlockStack>
  );
}
