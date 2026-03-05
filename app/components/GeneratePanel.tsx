import { useState, useCallback, useEffect, useMemo, useRef } from "react";
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
import { ImageIcon, CheckCircleIcon, XCircleIcon, ClockIcon } from "@shopify/polaris-icons";

interface Generation {
  id: string;
  prompt: string;
  uploadedFile: File | null;
  previewUrl: string | null;
  isGenerating: boolean;
  jobId: string | null;
  results: string[] | null;
  error: string | null;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  createdAt: number;
}

interface GeneratePanelProps {
  onGenerationComplete: () => void;
  shop: string;
  balance: number | null;
}

// Constants for polling and timeouts
const INITIAL_WAIT_MS = 120000; // 2 minutes initial wait
const WEBHOOK_GRACE_PERIOD_MS = 210000; // 3.5 minutes to wait for webhook
const POLL_INTERVAL_MS = 120000; // 2 minutes between polls
const MAX_POLL_COUNT = 4; // Max 4 polling attempts
const CANCEL_BUTTON_TIMEOUT_MS = 60000; // 1 minute before showing cancel button

export function GeneratePanel({ onGenerationComplete, shop, balance }: GeneratePanelProps) {
  const [prompt, setPrompt] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showCancelButton, setShowCancelButton] = useState(false);
  
  // Use refs to track polling state without causing re-renders
  const pollStartTimeRef = useRef<number>(0);
  const activeJobIdsRef = useRef<Set<string>>(new Set());
  const generationsRef = useRef<Generation[]>([]);
  const pollCountRef = useRef<number>(0);
  const initialWaitCompleteRef = useRef<boolean>(false);
  
  // Keep ref in sync with state
  useEffect(() => {
    generationsRef.current = generations;
    activeJobIdsRef.current = new Set(
      generations.filter(g => g.isGenerating && g.jobId).map(g => g.jobId!)
    );
  }, [generations]);
  
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
              isGenerating: job.status === 'queued' || job.status === 'processing',
              jobId: job.jobId,
              results: job.result ? JSON.parse(job.result).urls || [] : null,
              error: job.error || null,
              status: job.status,
              createdAt: job.createdAt ? new Date(job.createdAt).getTime() : Date.now(),
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

  // Update generation status helper - uses functional update to avoid stale closure
  const updateGenerationStatus = useCallback((jobId: string, updates: Partial<Generation>) => {
    console.log(`Updating generation ${jobId}:`, updates);
    setGenerations(prev => {
      const index = prev.findIndex(g => g.jobId === jobId);
      if (index === -1) {
        console.log(`Generation with jobId ${jobId} not found`);
        return prev;
      }
      const updated = [...prev];
      updated[index] = { ...updated[index], ...updates };
      return updated;
    });
  }, []);

  // Set up SSE event listening for webhook completion
  useEffect(() => {
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
                results: result?.urls || [],
                error: null,
              };
              // Trigger completion callback outside of render
              setTimeout(() => onGenerationComplete(), 0);
            } else if (status === 'failed') {
              console.log('Job failed via webhook:', jobId, error);
              updated[index] = {
                ...updated[index],
                isGenerating: false,
                status: 'failed',
                error: error || "Generation failed. Please try again.",
                results: null,
              };
            } else if (status === 'processing' || status === 'queued') {
              updated[index] = {
                ...updated[index],
                status: status,
              };
            }
            
            return updated;
          });

          // Clear from active jobs
          if (status === 'completed' || status === 'failed') {
            activeJobIdsRef.current.delete(jobId);
            setIsGenerating(activeJobIdsRef.current.size > 0);
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
        // The effect will re-run due to shop dependency if component is still mounted
      }, 5000);
    };

    return () => {
      console.log("Closing SSE connection");
      eventSource.close();
      clearTimeout(reconnectTimeout);
    };
  }, [shop, onGenerationComplete]);

  // Background polling - waits 2min, then 3.5min webhook grace, then 2min x4 polls
  useEffect(() => {
    if (!hasActiveGeneration) {
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
        setIsGenerating(false);
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
            updateGenerationStatus(jobId, {
              isGenerating: false,
              status: 'completed',
              results: result?.urls || [],
              error: null,
            });
            activeJobIdsRef.current.delete(jobId);
            setIsGenerating(activeJobIdsRef.current.size > 0);
            onGenerationComplete();
          } else if (data.job?.status === 'failed' || data.status === 'failed') {
            updateGenerationStatus(jobId, {
              isGenerating: false,
              status: 'failed',
              error: data.job?.error || data.error || 'Generation failed. Please try again.',
              results: null,
            });
            activeJobIdsRef.current.delete(jobId);
            setIsGenerating(activeJobIdsRef.current.size > 0);
          }
        } catch (error) {
          console.error(`Failed to poll status for ${jobId}:`, error);
        }
      }
    }, 5000); // Check every 5 seconds internally, but only poll after intervals

    return () => {
      clearInterval(pollInterval);
    };
  }, [hasActiveGeneration, updateGenerationStatus, onGenerationComplete]);

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
    setIsGenerating(false);
    setShowCancelButton(false);
    activeJobIdsRef.current.delete(activeGeneration.jobId);
  }, [generations, shop]);

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
      status: 'queued',
      createdAt: Date.now(),
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
          mode: "marketing",
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
      } else if (data.result) {
        // Synchronous response
        setGenerations(prev => prev.map(gen =>
          gen.id === generationId ? { ...gen, isGenerating: false, status: 'completed', results: data.result.urls || [] } : gen
        ));
        setIsGenerating(false);
        onGenerationComplete();
      }
    } catch (err) {
      setError("Failed to generate, please try again later.");
      setIsGenerating(false);
      setGenerations(prev => prev.map(gen =>
          gen.id === generationId ? { ...gen, isGenerating: false, status: 'failed', error: "Failed to generate, please try again later." } : gen
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
                            <InlineStack gap="200" blockAlign="center">
                              <Spinner size="small" />
                              <Text as="p" tone="subdued">
                                {gen.status === 'processing' ? 'Processing your images...' : 'Queued for generation...'}
                              </Text>
                            </InlineStack>
                            <Text as="p" tone="subdued" variant="bodySm">
                              This may take a few minutes. You can navigate away and come back.
                            </Text>
                          </BlockStack>
                        ) : gen.status === 'failed' || gen.error ? (
                          <BlockStack gap="200" align="center">
                            <InlineStack gap="200" blockAlign="center">
                              <Icon source={XCircleIcon} tone="critical" />
                              <Text as="p" tone="critical">{gen.error || "Generation failed"}</Text>
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
                        ) : gen.status === 'cancelled' ? (
                          <BlockStack gap="200" align="center">
                            <InlineStack gap="200" blockAlign="center">
                              <Icon source={XCircleIcon} tone="subdued" />
                              <Text as="p" tone="subdued">Generation was cancelled</Text>
                            </InlineStack>
                          </BlockStack>
                        ) : gen.results && gen.results.length > 0 ? (
                          <Box>
                            <div 
                              style={{ 
                                display: 'grid', 
                                gridTemplateColumns: 'repeat(2, 1fr)', 
                                gap: '8px',
                                width: '100%'
                              }}
                            >
                              {gen.results.map((imageUrl: string, index: number) => (
                                <div key={index} style={{ aspectRatio: '1/1', overflow: 'hidden', borderRadius: '8px' }}>
                                  <img 
                                    src={imageUrl} 
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
