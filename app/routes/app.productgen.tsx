import { useState, useCallback } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { decrypt } from "../lib/encryption.server";
import {
  Page,
  Card,
  Box,
  BlockStack,
  Text,
  Banner,
  TextField,
  Button,
  DropZone,
  Thumbnail,
  InlineStack,
  Spinner,
  InlineGrid,
  ProgressBar,
  Icon,
} from "@shopify/polaris";
import { ImageIcon } from "@shopify/polaris-icons";

// Components
import { CreditsBadge } from "../components/CreditsBadge";
import { History } from "../components/History";
import { useJobPoller } from "../hooks/useJobPoller";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  
  // Check if shop has a stored API key
  const storedKey = await prisma.apiKey.findUnique({
    where: { shop: session.shop },
  });
  
  let balance = null;
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
  }
  
  return { 
    shop: session.shop,
    isConnected: !!storedKey,
    balance,
  };
};

interface EcommerceResponse {
  success: boolean;
  versionId?: string;
  accepted?: boolean;
  jobId?: string;
  status?: string;
  statusEndpoint?: string;
  images?: {
    urls: string[];
    assetIds: string[];
    failedIds: string[];
    pendingIds: string[];
  };
  details?: {
    title: string;
    description: string;
    features: string[];
    specifications: Record<string, string>;
    platforms: Record<string, any>;
  };
  error?: string;
  message?: string;
}

interface ProductGeneration {
  id: string;
  prompt: string;
  uploadedFile: File | null;
  previewUrl: string | null;
  isGenerating: boolean;
  jobId: string | null;
  response: EcommerceResponse | null;
  error: string | null;
}

export default function ProductGenPage() {
  const { shop, isConnected, balance } = useLoaderData<typeof loader>();
  
  // Form state
  const [prompt, setPrompt] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  
  // Generation state
  const [generations, setGenerations] = useState<ProductGeneration[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  // Track if any generation is currently in progress
  const hasActiveGeneration = generations.some(gen => gen.isGenerating);

  const uploadUrlToTempFile = async (imageUrl: string): Promise<string> => {
    try {
      const resp = await fetch("https://tempfile.org/api/upload/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: imageUrl,
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
    const newGeneration: ProductGeneration = {
      id: generationId,
      prompt: prompt.trim(),
      uploadedFile,
      previewUrl,
      isGenerating: true,
      jobId: null,
      response: null,
      error: null,
    };

    setGenerations(prev => [newGeneration, ...prev]);
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
        setProgress(0);
        setGenerations(prev => prev.map(gen =>
          gen.id === generationId ? { ...gen, isGenerating: false, error: "Upload failed" } : gen
        ));
        return;
      }

      const resp = await fetch("/api/imai/generate/ecommerce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          url: processedImageUrl,
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
      } else if (data.success) {
        // Synchronous response
        clearInterval(progressInterval);
        setProgress(100);
        setGenerations(prev => prev.map(gen =>
          gen.id === generationId ? { ...gen, isGenerating: false, response: data } : gen
        ));
      }
    } catch (err) {
      clearInterval(progressInterval);
      const errorMsg = "Generation failed. Please try again.";
      setError(errorMsg);
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

  const handleGenerationComplete = useCallback(
    (generationId: string) => (result: any) => {
      setGenerations(prev => prev.map(gen =>
        gen.id === generationId
          ? { ...gen, isGenerating: !(result.images?.urls && result.images.urls.length > 0), response: result }
          : gen
      ));
      setProgress(100);
      setTimeout(() => setProgress(0), 2000);
    },
    []
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

  const primaryAction = undefined;

  return (
    <>
      <Page title="Product Gen" primaryAction={primaryAction}>
      <BlockStack gap="400">
        {!isConnected && (
          <Banner tone="info" title="Connect your IMAI Studio API key">
            <Text as="p">
              Connect your API key in the Settings tab to start generating product content.
              Get your key at{" "}
              <a href="https://www.imai.studio" target="_blank" rel="noopener noreferrer">
                www.imai.studio
              </a>
            </Text>
          </Banner>
        )}

        <Card>
          <Box padding="400">
            <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
              {/* Left Side */}
              <BlockStack gap="400">
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
                      >
                        Remove
                      </Button>
                    </InlineStack>
                  )}
                </BlockStack>

                <TextField
                  label="Custom Prompt (Optional)"
                  value={prompt}
                  onChange={setPrompt}
                  placeholder="Generate premium leather goods content"
                  multiline={3}
                  autoComplete="off"
                />

                {balance !== null && (
                  <Text as="p" tone="subdued">
                    Credits: {Math.round(balance)}
                  </Text>
                )}

                <Button
                  variant="primary"
                  onClick={handleGenerate}
                  disabled={!isConnected || !uploadedFile || isUploading || hasActiveGeneration}
                  size="large"
                >
                  Generate Content
                </Button>
              </BlockStack>

              {/* Right Side */}
              <BlockStack gap="400">
                {(() => {
                  if (hasActiveGeneration) {
                    return (
                      <Box 
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
                              Generating your content...
                            </Text>
                          </BlockStack>
                        </div>
                      </Box>
                    );
                  } else if (generations.length === 0) {
                    return (
                      <Box 
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
                    );
                  } else {
                    return generations.map((gen) => (
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
                            ) : gen.response?.images?.urls && gen.response.images.urls.length > 0 ? (
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
                                  {gen.response.images.urls.map((url: string, index: number) => (
                                    <div key={index} style={{ textAlign: 'center' }}>
                                      <img 
                                        src={url} 
                                        alt={`Generated product image ${index + 1}`}
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
                            ) : gen.response?.details ? (
                              <Box>
                                <Text variant="headingSm" as="h3">Product Details</Text>
                                <BlockStack gap="200">
                                  {gen.response.details.title && (
                                    <Box>
                                      <Text as="p" fontWeight="bold">Title:</Text>
                                      <Text as="p">{gen.response.details.title}</Text>
                                    </Box>
                                  )}
                                  
                                  {gen.response.details.description && (
                                    <Box>
                                      <Text as="p" fontWeight="bold">Description:</Text>
                                      <Text as="p">{gen.response.details.description}</Text>
                                    </Box>
                                  )}
                                  
                                  {gen.response.details.specifications && typeof gen.response.details.specifications === 'object' && Object.keys(gen.response.details.specifications).length > 0 && (
                                    <Box>
                                      <Text as="p" fontWeight="bold">Specifications:</Text>
                                      <ul>
                                        {Object.entries(gen.response.details.specifications).map(([key, value]) => (
                                          <li key={key}><strong>{key}:</strong> {String(value)}</li>
                                        ))}
                                      </ul>
                                    </Box>
                                  )}
                                  
                                  {gen.response.details.platforms && typeof gen.response.details.platforms === 'object' && Object.keys(gen.response.details.platforms).length > 0 && (
                                    <Box>
                                      <Text as="p" fontWeight="bold">Platform-Specific Content:</Text>
                                      {Object.entries(gen.response.details.platforms).map(([platform, content]) => (
                                        <Box key={platform} padding="200">
                                          <Text as="p" fontWeight="bold">{platform.toUpperCase()}:</Text>
                                          <pre style={{ whiteSpace: "pre-wrap", fontSize: "12px" }}>
                                            {JSON.stringify(content, null, 2)}
                                          </pre>
                                        </Box>
                                      ))}
                                    </Box>
                                  )}
                                </BlockStack>
                              </Box>
                            ) : null}
                          </BlockStack>
                        </Box>
                      </Card>
                    ));
                  }
                })()}
              </BlockStack>
            </InlineGrid>
          </Box>
        </Card>

        {isConnected && (
          <History 
            shop={shop} 
            refreshTrigger={0}
          />
        )}
      </BlockStack>
    </Page>
  </>
);
}
