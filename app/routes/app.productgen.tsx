import { useState, useCallback, useEffect } from "react";
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
  const [showCancelButton, setShowCancelButton] = useState(false);
  
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

    try {
      // Upload the image
      const processedImageUrl = await uploadImage();
      if (!processedImageUrl) {
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
        setGenerations(prev => prev.map(gen =>
          gen.id === generationId ? { ...gen, isGenerating: false, response: data } : gen
        ));
      }
    } catch (err) {
      const errorMsg = "Failed to generate, please try again later.";
      setError(errorMsg);
      setGenerations(prev => prev.map(gen =>
          gen.id === generationId ? { ...gen, isGenerating: false, error: errorMsg } : gen
        ));
    }

    // Clear inputs after starting generation
    setPrompt("");
    setUploadedFile(null);
  };

  useEffect(() => {
    if (!isConnected) return;

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
                  ? { ...gen, isGenerating: false, response: result }
                  : gen
              ));
              setProgress(100);
              setTimeout(() => setProgress(0), 2000);
              setShowCancelButton(false);
            } else if (status === 'failed') {
              console.log('Job failed via webhook:', jobId, error);
              setGenerations(prev => prev.map((gen, index) =>
                index === generationIndex
                  ? { ...gen, isGenerating: false, error: error || "Generation failed" }
                  : gen
              ));
              setProgress(0);
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
  }, [isConnected, generations]);

  // Timeout handling for webhook failures - persistent across refreshes
  useEffect(() => {
    if (!hasActiveGeneration) {
      setShowCancelButton(false);
      return;
    }

    // Find the active generation and check how long ago it was created
    const activeGeneration = generations.find(gen => gen.isGenerating && gen.jobId);
    if (!activeGeneration?.jobId) return;

    // For restored jobs, we need to check the database for creation time
    // For new jobs, we can use the current time as reference
    const isRestoredJob = activeGeneration.id.startsWith('restored-');

    let timeoutDelay = 600000; // 10 minutes default
    let showCancelDelay = 120000; // 2 minutes default

    if (isRestoredJob) {
      // For restored jobs, fetch the creation time from database
      const checkJobAge = async () => {
        try {
          const resp = await fetch(`/api/imai/status?jobId=${activeGeneration.jobId}`);
          if (resp.ok) {
            const data = await resp.json();
            if (data.job && data.job.createdAt) {
              const createdAt = new Date(data.job.createdAt);
              const now = new Date();
              const elapsed = now.getTime() - createdAt.getTime();

              if (elapsed >= 600000) { // Already 10+ minutes old
                console.log('Job already timed out, cancelling immediately');
                setGenerations(prev => prev.filter(gen => !gen.isGenerating));
                setShowCancelButton(false);
                return;
              } else {
                // Calculate remaining time
                timeoutDelay = 600000 - elapsed;
                showCancelDelay = Math.max(120000 - elapsed, 0);
              }
            }
          }
        } catch (error) {
          console.error('Failed to check job age:', error);
        }

        // Set up the timers with calculated delays
        if (showCancelDelay > 0) {
          const showCancelTimer = setTimeout(() => {
            setShowCancelButton(true);
          }, showCancelDelay);

          const autoCancelTimer = setTimeout(async () => {
            console.log('Auto-cancelling generation due to timeout');

            if (activeGeneration?.jobId) {
              try {
                await fetch('/api/imai/cancel', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    jobId: activeGeneration.jobId,
                    shop,
                  }),
                });
              } catch (error) {
                console.error('Failed to auto-cancel job in database:', error);
              }
            }

            setGenerations(prev => prev.map(gen =>
              gen.isGenerating
                ? { ...gen, isGenerating: false }
                : gen
            ));
            setShowCancelButton(false);
          }, timeoutDelay);

          return () => {
            clearTimeout(showCancelTimer);
            clearTimeout(autoCancelTimer);
          };
        }
      };

      checkJobAge();
    } else {
      // For new jobs, use the normal timer logic
      const showCancelTimer = setTimeout(() => {
        setShowCancelButton(true);
      }, showCancelDelay);

      const autoCancelTimer = setTimeout(async () => {
        console.log('Auto-cancelling generation due to timeout');

        if (activeGeneration?.jobId) {
          try {
            await fetch('/api/imai/cancel', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jobId: activeGeneration.jobId,
                shop,
              }),
            });
          } catch (error) {
            console.error('Failed to auto-cancel job in database:', error);
          }
        }

            setGenerations(prev => prev.filter(gen => !gen.isGenerating));
        setShowCancelButton(false);
      }, timeoutDelay);

      return () => {
        clearTimeout(showCancelTimer);
        clearTimeout(autoCancelTimer);
      };
    }
  }, [hasActiveGeneration, generations, shop]);

  const handleCancelGeneration = useCallback(async () => {
    // Find the active generation jobId
    const activeGeneration = generations.find(gen => gen.isGenerating && gen.jobId);
    if (!activeGeneration?.jobId) return;

    try {
      // Update the database to mark job as cancelled
      await fetch('/api/imai/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: activeGeneration.jobId,
          shop,
        }),
      });
    } catch (error) {
      console.error('Failed to cancel job in database:', error);
    }

    // Remove the cancelled generation from state to revert to placeholder
    setGenerations(prev => prev.filter(gen => gen.jobId !== activeGeneration.jobId));
    setShowCancelButton(false);
  }, [generations, shop]);

  const primaryAction = undefined;

  return (
    <>
      <Page title="Product Gen" primaryAction={primaryAction}>
      <BlockStack gap="400">
        {/* First Banner - Top of Page */}
        <Card>
          <Box padding="400">
            <img 
              src="/productgen.png" 
              alt="Product Generation Banner"
              style={{ 
                width: "100%", 
                height: "auto", 
                borderRadius: "12px",
                objectFit: "cover"
              }}
            />
          </Box>
        </Card>

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
                              <div style={{ textAlign: 'center', padding: '20px' }}>
                                <Text as="p" tone="critical">Failed to generate, please try again later.</Text>
                              </div>
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

        {/* Second Banner - Above History */}
        <Card>
          <Box padding="400">
            <img 
              src="/productgen2.png" 
              alt="Product History Banner"
              style={{ 
                width: "100%", 
                height: "auto", 
                borderRadius: "12px",
                objectFit: "cover"
              }}
            />
          </Box>
        </Card>

        {isConnected && (
          <History 
            shop={shop} 
          />
        )}
      </BlockStack>
    </Page>
  </>
);
}
