import { useState, useCallback, useEffect, useRef } from "react";
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
import { ImageIcon, CheckCircleIcon, XCircleIcon, PlusIcon } from "@shopify/polaris-icons";

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
  urls?: string[];
  text?: string;
  details?: {
    title?: string;
    description?: string;
    features?: string[];
    specifications?: Record<string, string>;
    platforms?: Record<string, any>;
  };
  images?: {
    urls: string[];
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
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  createdAt: number;
}

// Constants for polling and timeouts
const INITIAL_WAIT_MS = 120000; // 2 minutes initial wait
const WEBHOOK_GRACE_PERIOD_MS = 210000; // 3.5 minutes to wait for webhook
const POLL_INTERVAL_MS = 120000; // 2 minutes between polls
const MAX_POLL_COUNT = 4; // Max 4 polling attempts
const CANCEL_BUTTON_TIMEOUT_MS = 60000; // 1 minute before showing cancel button

export default function ProductGenPage() {
  const { shop, isConnected, balance } = useLoaderData<typeof loader>();
  
  // Use refs to track polling state without causing re-renders
  const pollStartTimeRef = useRef<number>(0);
  const activeJobIdsRef = useRef<Set<string>>(new Set());
  const pollCountRef = useRef<number>(0);
  const initialWaitCompleteRef = useRef<boolean>(false);
  
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
      status: 'queued',
      createdAt: Date.now(),
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
          gen.id === generationId ? { ...gen, jobId: data.jobId, status: 'queued' } : gen
        ));
      } else if (data.success) {
        // Synchronous response
        setGenerations(prev => prev.map(gen =>
          gen.id === generationId ? { ...gen, isGenerating: false, status: 'completed', response: data } : gen
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

  // Set up SSE event listening for webhook completion
  useEffect(() => {
    if (!isConnected) return;

    console.log("Setting up SSE connection for shop:", shop);
    const eventSource = new EventSource(`/api/imai/events?shop=${shop}`);
    let reconnectTimeout: NodeJS.Timeout;

    eventSource.onopen = () => {
      console.log("SSE connection opened successfully");
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("SSE event received:", data);
        
        if (data.type === 'job_update') {
          const { jobId, status, result, error } = data;

          // Use functional update to always get latest state
          setGenerations(prev => {
            const index = prev.findIndex(gen => gen.jobId === jobId);
            console.log("Found generation index:", index, "for jobId:", jobId);
            
            if (index === -1) {
              console.log("No generation found for jobId:", jobId);
              return prev;
            }

            const updated = [...prev];
            
            if (status === 'completed') {
              console.log('Job completed via webhook:', jobId);
              updated[index] = {
                ...updated[index],
                isGenerating: false,
                status: 'completed',
                response: result,
                error: null,
              };
              // Update progress outside of render
              setTimeout(() => {
                setProgress(100);
                setTimeout(() => setProgress(0), 2000);
              }, 0);
            } else if (status === 'failed') {
              console.log('Job failed via webhook:', jobId, error);
              updated[index] = {
                ...updated[index],
                isGenerating: false,
                status: 'failed',
                error: error || "Generation failed. Please try again.",
                response: null,
              };
              setTimeout(() => setProgress(0), 0);
            } else if (status === 'processing' || status === 'queued') {
              updated[index] = {
                ...updated[index],
                status: status,
              };
            }
            
            return updated;
          });

          // Clear from active jobs and update UI state
          if (status === 'completed' || status === 'failed') {
            activeJobIdsRef.current.delete(jobId);
            setShowCancelButton(false);
          }
        }
      } catch (err) {
        console.error("Error parsing SSE event:", err);
      }
    };

    eventSource.onerror = (error) => {
      console.error("SSE connection error:", error);
      eventSource.close();
      
      // Auto-reconnect after 5 seconds
      reconnectTimeout = setTimeout(() => {
        console.log("Attempting SSE reconnection...");
      }, 5000);
    };

    return () => {
      console.log("Closing SSE connection");
      eventSource.close();
      clearTimeout(reconnectTimeout);
    };
  }, [isConnected, shop]);

  // Background polling - waits 2min, then 3.5min webhook grace, then 2min x4 polls
  useEffect(() => {
    if (!isConnected || !hasActiveGeneration) {
      pollStartTimeRef.current = 0;
      pollCountRef.current = 0;
      initialWaitCompleteRef.current = false;
      return;
    }

    // Start polling timer
    if (pollStartTimeRef.current === 0) {
      pollStartTimeRef.current = Date.now();
      console.log('Starting generation - initial 2min wait...');
    }

    const pollInterval = setInterval(async () => {
      const elapsed = Date.now() - pollStartTimeRef.current;
      const activeJobIds = Array.from(activeJobIdsRef.current);
      
      if (activeJobIds.length === 0) {
        clearInterval(pollInterval);
        return;
      }

      // Phase 1: Initial 2 minute wait - do nothing
      if (elapsed < INITIAL_WAIT_MS) {
        console.log(`Initial wait: ${Math.round(elapsed / 1000)}s / ${INITIAL_WAIT_MS / 1000}s`);
        return;
      }

      // Mark initial wait as complete
      if (!initialWaitCompleteRef.current) {
        initialWaitCompleteRef.current = true;
        console.log('Initial 2min wait complete - entering webhook grace period (3.5min)');
      }

      // Phase 2: Webhook grace period (3.5 min) - light logging only
      const gracePeriodElapsed = elapsed - INITIAL_WAIT_MS;
      if (gracePeriodElapsed < WEBHOOK_GRACE_PERIOD_MS) {
        console.log(`Webhook grace period: ${Math.round(gracePeriodElapsed / 1000)}s / ${WEBHOOK_GRACE_PERIOD_MS / 1000}s`);
        return;
      }

      // Phase 3: Active polling - every 2 minutes, max 4 times
      if (pollCountRef.current >= MAX_POLL_COUNT) {
        console.log('Max polling attempts reached (4x), marking as failed');
        // Mark remaining jobs as failed
        setGenerations(prev => prev.map(gen => {
          if (gen.isGenerating && gen.jobId) {
            return { ...gen, isGenerating: false, status: 'failed', error: 'Generation timed out. Please try again.' };
          }
          return gen;
        }));
        setProgress(0);
        setShowCancelButton(false);
        pollStartTimeRef.current = 0;
        pollCountRef.current = 0;
        clearInterval(pollInterval);
        return;
      }

      pollCountRef.current++;
      console.log(`Polling attempt ${pollCountRef.current}/${MAX_POLL_COUNT} (${elapsed / 1000}s elapsed)`);

      for (const jobId of activeJobIds) {
        try {
          const resp = await fetch(`/api/imai/status?jobId=${jobId}`);
          if (!resp.ok) continue;

          const data = await resp.json();
          console.log(`Poll result for ${jobId}:`, data.status);

          if (data.job?.status === 'completed' || data.status === 'completed') {
            const result = data.job?.result ? JSON.parse(data.job.result) : data.result;
            setGenerations(prev => {
              const index = prev.findIndex(gen => gen.jobId === jobId);
              if (index === -1) return prev;
              const updated = [...prev];
              updated[index] = {
                ...updated[index],
                isGenerating: false,
                status: 'completed',
                response: result,
                error: null,
              };
              return updated;
            });
            setProgress(100);
            setTimeout(() => setProgress(0), 2000);
            activeJobIdsRef.current.delete(jobId);
            setShowCancelButton(false);
          } else if (data.job?.status === 'failed' || data.status === 'failed') {
            setGenerations(prev => {
              const index = prev.findIndex(gen => gen.jobId === jobId);
              if (index === -1) return prev;
              const updated = [...prev];
              updated[index] = {
                ...updated[index],
                isGenerating: false,
                status: 'failed',
                error: data.job?.error || data.error || 'Generation failed. Please try again.',
                response: null,
              };
              return updated;
            });
            setProgress(0);
            activeJobIdsRef.current.delete(jobId);
            setShowCancelButton(false);
          }
        } catch (error) {
          console.error(`Failed to poll status for ${jobId}:`, error);
        }
      }
    }, 5000); // Check every 5 seconds internally, but only poll after intervals

    return () => {
      clearInterval(pollInterval);
    };
  }, [isConnected, hasActiveGeneration]);
  // Show cancel button after timeout (user can cancel if webhook seems stuck)
  useEffect(() => {
    if (!hasActiveGeneration) {
      setShowCancelButton(false);
      return;
    }

    const timer = setTimeout(() => {
      setShowCancelButton(true);
    }, CANCEL_BUTTON_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, [hasActiveGeneration]);

  const handleCancelGeneration = useCallback(async () => {
    const activeGeneration = generations.find(gen => gen.isGenerating && gen.jobId);
    if (!activeGeneration?.jobId) return;

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
      console.error('Failed to cancel job in database:', error);
    }

    setGenerations(prev => prev.map(gen => 
      gen.jobId === activeGeneration.jobId
        ? { ...gen, isGenerating: false, status: 'cancelled', error: 'Generation was cancelled' }
        : gen
    ));
    setShowCancelButton(false);
    activeJobIdsRef.current.delete(activeGeneration.jobId);
  }, [generations, shop]);

  const primaryAction = undefined;

  return (
    <>
      <Page title="Product Studio" primaryAction={primaryAction}>
      <BlockStack gap="400">
        <Box paddingBlockEnd="200" style={{ marginTop: '-20px' }}>
          <Text as="p" tone="subdued">
            Create professional product photos for your store. Turn any product image into clean catalogue shots, lifestyle scenes, or marketing visuals.
          </Text>
        </Box>
        {/* First Banner - Top of Page */}
        <Card>
          <Box padding="400">
            <img 
              src="/productgen.png" 
              alt="Product Studio Banner"
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
                          width: '100%',
                          padding: '16px'
                        }}
                      >
                        <div
                          style={{
                            display: 'inline-flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '4px',
                            margin: 0,
                            padding: 0,
                          }}
                        >
                          <Icon source={PlusIcon} tone="subdued" />
                          <span style={{ fontSize: '13px', color: 'var(--p-color-text-subdued)', margin: 0, lineHeight: 1.3 }}>
                            Drop or click to upload
                          </span>
                        </div>
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
                  placeholder='e.g. "Clean white background ecommerce shot" or "Luxury product on marble surface"'
                  multiline={3}
                  autoComplete="off"
                  helpText="Add style, mood, or background ideas to guide the AI."
                />

                {balance !== null && (
                  <Text as="p" tone="subdued">
                    Credits remaining: {Math.round(balance)}
                  </Text>
                )}

                <Box paddingBlockStart="200" paddingBlockEnd="0">
                  <div style={{ width: '100%' }}>
                    <Button
                      variant="primary"
                      fullWidth
                      onClick={handleGenerate}
                      disabled={!isConnected || !uploadedFile || isUploading || hasActiveGeneration}
                      size="large"
                      style={{
                        backgroundColor: '#000',
                        color: '#fff',
                        padding: '14px 24px',
                        fontSize: '16px',
                        textAlign: 'center',
                        fontWeight: 600,
                      }}
                    >
                      Generate Content
                    </Button>
                  </div>
                </Box>
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
                                <InlineStack gap="200" blockAlign="center">
                                  <Spinner size="small" />
                                  <Text as="p" tone="subdued">
                                    {gen.status === 'processing' ? 'Processing your content...' : 'Queued for generation...'}
                                  </Text>
                                </InlineStack>
                                <Text as="p" tone="subdued" variant="bodySm">
                                  This may take a few minutes. You can navigate away and come back.
                                </Text>
                              </BlockStack>
                            ) : gen.status === 'failed' || gen.error ? (
                              <div style={{ textAlign: 'center', padding: '20px' }}>
                                <BlockStack gap="200" align="center">
                                  <InlineStack gap="200" blockAlign="center">
                                    <Icon source={XCircleIcon} tone="critical" />
                                    <Text as="p" tone="critical">Failed to generate, please try again later.</Text>
                                  </InlineStack>
                                  <Button 
                                    variant="plain" 
                                    tone="critical"
                                    onClick={() => {
                                      setPrompt(gen.prompt);
                                      if (gen.previewUrl) {
                                        setPreviewUrl(gen.previewUrl);
                                      }
                                    }}
                                  >
                                    Retry with same prompt
                                  </Button>
                                </BlockStack>
                              </div>
                            ) : gen.status === 'cancelled' ? (
                              <BlockStack gap="200" align="center">
                                <InlineStack gap="200" blockAlign="center">
                                  <Icon source={XCircleIcon} tone="subdued" />
                                  <Text as="p" tone="subdued">Generation was cancelled</Text>
                                </InlineStack>
                              </BlockStack>
                            ) : gen.response?.urls && gen.response.urls.length > 0 ? (
                              <Box>
                                <div 
                                  style={{ 
                                    display: 'grid', 
                                    gridTemplateColumns: 'repeat(2, 1fr)', 
                                    gap: '8px',
                                    width: '100%'
                                  }}
                                >
                                  {gen.response.urls.slice(0, 4).map((url: string, index: number) => (
                                    <div key={index} style={{ aspectRatio: '1/1', overflow: 'hidden', borderRadius: '8px' }}>
                                      <img 
                                        src={url} 
                                        alt={`Generated ${index + 1}`}
                                        style={{ 
                                          width: '100%', 
                                          height: '100%', 
                                          objectFit: 'cover',
                                          display: 'block'
                                        }}
                                      />
                                    </div>
                                  ))}
                                </div>
                              </Box>
                            ) : gen.response?.text ? (() => {
                              // Parse text field which contains JSON string
                              let parsedDetails: any = null;
                              try {
                                parsedDetails = JSON.parse(gen.response.text || '{}');
                              } catch (e) {
                                parsedDetails = { description: gen.response.text };
                              }
                              return (
                                <Box>
                                  <Text variant="headingSm" as="h3">Product Details</Text>
                                  <BlockStack gap="200">
                                    {parsedDetails?.title && (
                                      <Box>
                                        <Text as="p" fontWeight="bold">Title:</Text>
                                        <Text as="p">{parsedDetails.title}</Text>
                                      </Box>
                                    )}
                                    
                                    {parsedDetails?.description && (
                                      <Box>
                                        <Text as="p" fontWeight="bold">Description:</Text>
                                        <Text as="p">{parsedDetails.description}</Text>
                                      </Box>
                                    )}
                                    
                                    {parsedDetails?.features && parsedDetails.features.length > 0 && (
                                      <Box paddingBlockStart="200">
                                        <Text as="p" fontWeight="bold">Features:</Text>
                                        <Box paddingBlockStart="100">
                                          {parsedDetails.features.map((feature: string, idx: number) => (
                                            <InlineStack key={idx} gap="200" blockAlign="center">
                                              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4A90E2' }} />
                                              <Text as="p" variant="bodySm">{feature}</Text>
                                            </InlineStack>
                                          ))}
                                        </Box>
                                      </Box>
                                    )}
                                    
                                    {parsedDetails?.specifications && typeof parsedDetails.specifications === 'object' && Object.keys(parsedDetails.specifications).length > 0 && (
                                      <Box paddingBlockStart="200">
                                        <Text as="p" fontWeight="bold">Specifications:</Text>
                                        <Box paddingBlockStart="100">
                                          <InlineStack gap="200" wrap>
                                            {Object.entries(parsedDetails.specifications).map(([key, value]) => (
                                              <span key={key} style={{ 
                                                background: '#f1f1f1', 
                                                padding: '4px 12px', 
                                                borderRadius: '12px',
                                                fontSize: '12px'
                                              }}>
                                                <strong>{key}:</strong> {String(value)}
                                              </span>
                                            ))}
                                          </InlineStack>
                                        </Box>
                                      </Box>
                                    )}
                                    
                                    {parsedDetails?.platforms && typeof parsedDetails.platforms === 'object' && Object.keys(parsedDetails.platforms).length > 0 && (
                                      <Box paddingBlockStart="300">
                                        <Text as="p" fontWeight="bold">Platform Content:</Text>
                                        <Box paddingBlockStart="200">
                                          <BlockStack gap="300">
                                          {Object.entries(parsedDetails.platforms).map(([platform, content]: [string, any]) => (
                                            <Card key={platform}>
                                              <Box padding="300">
                                                <BlockStack gap="200">
                                                  <Text as="p" fontWeight="bold" tone="subdued">
                                                    {platform === 'shopify' ? '🛍️ Shopify' : platform === 'generic' ? '🌐 Generic' : platform.toUpperCase()}
                                                  </Text>
                                                  {content?.title && (
                                                    <Box>
                                                      <Text as="p" variant="bodySm" tone="subdued">Title</Text>
                                                      <Text as="p">{content.title}</Text>
                                                    </Box>
                                                  )}
                                                  {content?.description && (
                                                    <Box>
                                                      <Text as="p" variant="bodySm" tone="subdued">Description</Text>
                                                      <Text as="p" variant="bodySm">{content.description}</Text>
                                                    </Box>
                                                  )}
                                                  {content?.metadata?.features && content.metadata.features.length > 0 && (
                                                    <Box>
                                                      <Text as="p" variant="bodySm" tone="subdued">Key Features</Text>
                                                      <InlineStack gap="100" wrap>
                                                        {content.metadata.features.slice(0, 3).map((f: string, i: number) => (
                                                          <span key={i} style={{ fontSize: '11px', background: '#e8f4fd', padding: '2px 8px', borderRadius: '4px' }}>
                                                            {f.substring(0, 30)}{f.length > 30 ? '...' : ''}
                                                          </span>
                                                        ))}
                                                      </InlineStack>
                                                    </Box>
                                                  )}
                                                </BlockStack>
                                              </Box>
                                            </Card>
                                          ))}
                                          </BlockStack>
                                        </Box>
                                      </Box>
                                    )}
                                  </BlockStack>
                                </Box>
                              );
                            })() : null}
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
