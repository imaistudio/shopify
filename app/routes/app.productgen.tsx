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
} from "@shopify/polaris";

// Components
import { CreditsBadge } from "../components/CreditsBadge";
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

export default function ProductGenPage() {
  const { shop, isConnected, balance } = useLoaderData<typeof loader>();
  
  // Form state
  const [url, setUrl] = useState("");
  const [prompt, setPrompt] = useState("");
  
  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  
  // Response state
  const [response, setResponse] = useState<EcommerceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!url.trim()) {
      setError("Please provide an image URL");
      return;
    }

    setIsGenerating(true);
    setError(null);
    setResponse(null);
    setJobId(null);

    try {
      const resp = await fetch("/api/imai/generate/ecommerce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          url: url.trim(),
          shop,
        }),
      });

      if (!resp.ok) {
        throw new Error("Generation request failed");
      }

      const data = await resp.json();
      
      if (data.jobId) {
        setJobId(data.jobId);
      } else if (data.success) {
        // Synchronous response
        setResponse(data);
        setIsGenerating(false);
      }
    } catch (err) {
      setError("Generation failed. Please try again.");
      setIsGenerating(false);
    }
  };

  const handleGenerationComplete = useCallback((result: any) => {
    setResponse(result);
    setIsGenerating(false);
  }, []);

  const handleGenerationError = useCallback((err: string) => {
    setError(err);
    setIsGenerating(false);
  }, []);

  useJobPoller(jobId, handleGenerationComplete, handleGenerationError);

  const primaryAction = isConnected ? (
    <CreditsBadge balance={balance} isLoading={false} />
  ) : undefined;

  return (
    <Page title="ProductGen" primaryAction={primaryAction}>
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

        {isConnected && balance !== null && balance < 100 && (
          <Banner tone="warning" title="Low credits">
            <Text as="p">
              You have fewer than 100 credits remaining. Top up at{" "}
              <a href="https://www.imai.studio" target="_blank" rel="noopener noreferrer">
                www.imai.studio
              </a>
            </Text>
          </Banner>
        )}

        <Card>
          <Box padding="400">
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                Generate E-commerce Content
              </Text>
              
              <TextField
                label="Product Image URL"
                value={url}
                onChange={setUrl}
                placeholder="https://example.com/product-image.jpg"
                type="url"
                autoComplete="off"
                error={error && !url.trim() ? "URL is required" : undefined}
              />

              <TextField
                label="Custom Prompt (Optional)"
                value={prompt}
                onChange={setPrompt}
                placeholder="Generate premium leather goods content"
                multiline={3}
                autoComplete="off"
              />

              <Button
                variant="primary"
                onClick={handleGenerate}
                loading={isGenerating}
                disabled={!isConnected || !url.trim() || isGenerating}
                size="large"
              >
                Generate Content
              </Button>

              {error && (
                <Banner tone="critical" title="Error">
                  <Text as="p">{error}</Text>
                </Banner>
              )}
            </BlockStack>
          </Box>
        </Card>

        {response && (
          <Card>
            <Box padding="400">
              <BlockStack gap="400">
                {response.versionId && (
                  <Box>
                    <Text variant="headingSm" as="h3">Version ID</Text>
                    <Text as="p">{response.versionId}</Text>
                  </Box>
                )}

                {response.jobId && (
                  <Box>
                    <Text variant="headingSm" as="h3">Job ID</Text>
                    <Text as="p">{response.jobId}</Text>
                    {response.status && (
                      <Text as="p" tone="subdued">Status: {response.status}</Text>
                    )}
                  </Box>
                )}

                {response.images && (
                  <Box>
                    <Text variant="headingSm" as="h3">Generated Images</Text>
                    {response.images.urls.length > 0 ? (
                      <BlockStack gap="200">
                        {response.images.urls.map((imageUrl, index) => (
                          <Box key={index}>
                            <img 
                              src={imageUrl} 
                              alt={`Generated product image ${index + 1}`}
                              style={{ maxWidth: "200px", height: "auto" }}
                            />
                            <Text as="p" tone="subdued">{imageUrl}</Text>
                          </Box>
                        ))}
                      </BlockStack>
                    ) : (
                      <Text as="p" tone="subdued">No images generated</Text>
                    )}
                  </Box>
                )}

                {response.details && (
                  <Box>
                    <Text variant="headingSm" as="h3">Product Details</Text>
                    <BlockStack gap="200">
                      <Box>
                        <Text as="p" fontWeight="bold">Title:</Text>
                        <Text as="p">{response.details.title}</Text>
                      </Box>
                      
                      <Box>
                        <Text as="p" fontWeight="bold">Description:</Text>
                        <Text as="p">{response.details.description}</Text>
                      </Box>

                      {response.details.features && response.details.features.length > 0 && (
                        <Box>
                          <Text as="p" fontWeight="bold">Features:</Text>
                          <ul>
                            {response.details.features.map((feature, index) => (
                              <li key={index}>{feature}</li>
                            ))}
                          </ul>
                        </Box>
                      )}

                      {response.details.specifications && Object.keys(response.details.specifications).length > 0 && (
                        <Box>
                          <Text as="p" fontWeight="bold">Specifications:</Text>
                          <ul>
                            {Object.entries(response.details.specifications).map(([key, value]) => (
                              <li key={key}><strong>{key}:</strong> {String(value)}</li>
                            ))}
                          </ul>
                        </Box>
                      )}

                      {response.details.platforms && Object.keys(response.details.platforms).length > 0 && (
                        <Box>
                          <Text as="p" fontWeight="bold">Platform-Specific Content:</Text>
                          {Object.entries(response.details.platforms).map(([platform, content]) => (
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
                )}
              </BlockStack>
            </Box>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}
