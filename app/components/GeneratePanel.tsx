import { useState, useCallback } from "react";
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
  ProgressBar,
  Thumbnail,
  Spinner,
  Box,
  Divider,
  InlineGrid,
  RadioButton,
} from "@shopify/polaris";
import { useJobPoller } from "../hooks/useJobPoller";

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
  const [progress, setProgress] = useState(0);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleGenerationComplete = useCallback(
    (generationId: string) => (result: any) => {
      setGenerations(prev => prev.map(gen =>
        gen.id === generationId
          ? { ...gen, isGenerating: false, results: result.urls || [] }
          : gen
      ));
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

  useJobPoller(jobs);

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

    // Animate progress bar to 80% over ~40 seconds
    const progressInterval = setInterval(() => {
      setProgress((p) => {
        if (p >= 80) return p;
        return p + 2;
      });
    }, 1000);

    try {
      // Upload the image
      const processedImageUrl = await uploadImage();
      if (!processedImageUrl) {
        clearInterval(progressInterval);
        setIsGenerating(false);
        setProgress(0);
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
        clearInterval(progressInterval);
        setProgress(100);
        setGenerations(prev => prev.map(gen =>
          gen.id === generationId ? { ...gen, isGenerating: false, results: data.result.urls || [] } : gen
        ));
        setIsGenerating(false);
        onGenerationComplete();
      }
    } catch (err) {
      clearInterval(progressInterval);
      const errorMsg = "Generation failed. Please try again.";
      setError(errorMsg);
      setIsGenerating(false);
      setProgress(0);
      setGenerations(prev => prev.map(gen =>
        gen.id === generationId ? { ...gen, isGenerating: false, error: errorMsg } : gen
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
    <>
      <BlockStack gap="400">
      {error && (
        <Banner tone="critical" title="Generation failed">
          <Text as="p">{error}</Text>
          <Button onClick={handleGenerate} tone="critical" variant="plain">
            Retry
          </Button>
        </Banner>
      )}

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
            disabled={isGenerating}
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
                <Box padding="400">
                  <Text as="p" alignment="center" tone="subdued">
                    Drop an image here or click to upload
                  </Text>
                </Box>
              </DropZone>
            ) : (
              <InlineStack gap="200" blockAlign="center">
                <Thumbnail source={previewUrl || ""} size="small" alt="Reference" />
                <Text as="p">{uploadedFile.name}</Text>
                <Button
                  variant="plain"
                  tone="critical"
                  onClick={clearImage}
                  disabled={isGenerating}
                >
                  Remove
                </Button>
                {isUploading && <Spinner size="small" />}
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
                disabled={isGenerating}
              />
              <RadioButton
                label="Design Concepts"
                helpText="Creative concepts and design variations"
                checked={mode === "design"}
                onChange={() => setMode("design")}
                disabled={isGenerating}
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
              loading={isGenerating}
              disabled={!prompt.trim() || !uploadedFile || isGenerating || isUploading}
              onClick={handleGenerate}
            >
              Generate
            </Button>
          </InlineStack>

          {isGenerating && progress < 100 && (
            <BlockStack gap="200">
              <ProgressBar progress={progress} size="small" tone="primary" />
              <Text as="p" tone="subdued" alignment="center">
                Generating your images...
              </Text>
            </BlockStack>
          )}
        </BlockStack>

        {/* Right Side */}
        <BlockStack gap="400">
          {generations.length === 0 ? (
            <Box padding="400">
              <Text as="p" alignment="center" tone="subdued">
                Generated images will appear here
              </Text>
            </Box>
          ) : (
            generations.map((gen) => (
              <Card key={gen.id}>
                <Box padding="400">
                  <BlockStack gap="200">
                    <Text as="p" variant="headingSm">{gen.prompt}</Text>
                    {gen.isGenerating ? (
                      <BlockStack gap="200" align="center">
                        <Spinner size="large" />
                        <Text as="p" tone="subdued">Generating...</Text>
                      </BlockStack>
                    ) : gen.error ? (
                      <Text as="p" tone="critical">{gen.error}</Text>
                    ) : gen.results ? (
                      <InlineGrid columns={{ xs: 2, sm: 3 }} gap="300">
                        {gen.results.map((url, index) => (
                          <Box key={index} borderRadius="200" overflowX="hidden">
                            <img
                              src={url}
                              style={{ width: "100%", display: "block" }}
                              alt={`Generated ${index + 1}`}
                            />
                          </Box>
                        ))}
                      </InlineGrid>
                    ) : null}
                  </BlockStack>
                </Box>
              </Card>
            ))
          )}
        </BlockStack>
      </InlineGrid>
    </BlockStack>
    </>
  );
}
