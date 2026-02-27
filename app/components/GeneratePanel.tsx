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

interface GeneratePanelProps {
  onGenerationComplete: () => void;
  shop: string;
}

export function GeneratePanel({ onGenerationComplete, shop }: GeneratePanelProps) {
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<"marketing" | "design">("marketing");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [jobId, setJobId] = useState<string | null>(null);
  const [results, setResults] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleGenerationComplete = useCallback(
    (result: { urls: string[] }) => {
      setProgress(100);
      setResults(result.urls);
      setIsGenerating(false);
      onGenerationComplete();
    },
    [onGenerationComplete]
  );

  const handleGenerationError = useCallback((err: string) => {
    setError(err);
    setIsGenerating(false);
    setProgress(0);
  }, []);

  useJobPoller(jobId, handleGenerationComplete, handleGenerationError);

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

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);
    setError(null);
    setResults([]);
    setProgress(0);

    // Animate progress bar to 80% over ~40 seconds
    const progressInterval = setInterval(() => {
      setProgress((p) => {
        if (p >= 80) return p;
        return p + 2;
      });
    }, 1000);

    try {
      // Upload image if attached
      let imageUrl: string | null = null;
      if (uploadedFile) {
        imageUrl = await uploadImage();
        if (!imageUrl) {
          clearInterval(progressInterval);
          setIsGenerating(false);
          setProgress(0);
          return;
        }
      }

      // Call generate API
      const resp = await fetch("/api/imai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          url: imageUrl,
          mode,
          shop,
        }),
      });

      if (!resp.ok) {
        throw new Error("Generation request failed");
      }

      const data = await resp.json();
      
      if (data.jobId) {
        setJobId(data.jobId);
      } else if (data.result) {
        // Synchronous response
        clearInterval(progressInterval);
        setProgress(100);
        setResults(data.result.urls);
        setIsGenerating(false);
        onGenerationComplete();
      }
    } catch (err) {
      clearInterval(progressInterval);
      setError("Generation failed. Please try again.");
      setIsGenerating(false);
      setProgress(0);
    }
  };

  return (
    <BlockStack gap="400">
      {error && (
        <Banner tone="critical" title="Generation failed">
          <Text>{error}</Text>
          <Button onClick={handleGenerate} tone="critical" variant="plain">
            Retry
          </Button>
        </Banner>
      )}

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
          Reference Image (optional)
        </Text>
        
        {!uploadedFile ? (
          <DropZone
            accept="image/*"
            type="image"
            onDrop={handleDrop}
            allowMultiple={false}
          >
            <DropZone.FileUpload
              actionTitle="Add image"
              actionHint="or drop a JPG/PNG here (max 10MB)"
            />
          </DropZone>
        ) : (
          <InlineStack gap="200" blockAlign="center">
            <Thumbnail source={previewUrl || ""} size="small" alt="Reference" />
            <Text>{uploadedFile.name}</Text>
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

      <BlockStack gap="200">
        <Text variant="headingSm">Generation Mode</Text>
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

      <InlineStack gap="300" blockAlign="center">
        <Button
          variant="primary"
          size="large"
          loading={isGenerating}
          disabled={!prompt.trim() || isGenerating || isUploading}
          onClick={handleGenerate}
        >
          Generate
        </Button>
        <Text tone="subdued">~15 credits per generation</Text>
      </InlineStack>

      {isGenerating && progress < 100 && (
        <BlockStack gap="200">
          <ProgressBar progress={progress} size="small" tone="primary" />
          <Text tone="subdued" alignment="center">
            Generating your images... this usually takes 30–60 seconds
          </Text>
        </BlockStack>
      )}

      {results.length > 0 && (
        <BlockStack gap="400">
          <Divider />
          <Text variant="headingSm">Results</Text>
          <InlineGrid columns={{ xs: 2, sm: 3 }} gap="300">
            {results.map((url, index) => (
              <Box key={index} borderRadius="200" overflow="hidden">
                <img
                  src={url}
                  style={{ width: "100%", display: "block" }}
                  alt={`Generated ${index + 1}`}
                />
              </Box>
            ))}
          </InlineGrid>
          <Button onClick={() => {}}>View in Library →</Button>
        </BlockStack>
      )}
    </BlockStack>
  );
}
