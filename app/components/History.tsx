import { useCallback, useEffect, useState } from "react";
import {
  Card,
  Box,
  BlockStack,
  Text,
  InlineGrid,
  Modal,
  Toast,
  Frame,
} from "@shopify/polaris";

interface HistoryItem {
  id: string;
  prompt: string;
  results: string[];
  error?: string | null;
  response?: {
    details?: {
      title?: string;
    };
  } & Record<string, unknown>;
}

interface SelectedImage {
  url: string;
  prompt?: string;
  index: number;
}

interface HistoryProps {
  endpoint: "marketing" | "ecommerce";
  refreshTrigger?: number;
  onHasVisibleHistoryChange?: (hasVisibleHistory: boolean) => void;
  showLoadingState?: boolean;
}

export function History({
  endpoint,
  refreshTrigger,
  onHasVisibleHistoryChange,
  showLoadingState = false,
}: HistoryProps) {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("Image imported to Shopify Files!");
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [brokenImageUrls, setBrokenImageUrls] = useState<Set<string>>(new Set());

  const markImageAsBroken = (url: string) => {
    setBrokenImageUrls((prev) => {
      if (prev.has(url)) return prev;
      const next = new Set(prev);
      next.add(url);
      return next;
    });
  };

  type HistoryApiItem = {
    id: string;
    prompt: string;
    results?: unknown;
    response?: HistoryItem["response"];
  };

  const loadHistory = useCallback(async () => {
    try {
      setLoading(true);
      const resp = await fetch(`/api/imai/history?endpoint=${encodeURIComponent(endpoint)}`);
      if (resp.ok) {
        const data = (await resp.json()) as HistoryApiItem[];
        setBrokenImageUrls(new Set());
        setHistory(data.map((h) => ({
          id: `history-${h.id}`,
          prompt: h.prompt,
          results: Array.isArray(h.results) ? h.results : [],
          response: h.response ?? undefined,
          error: null,
        })));
      }
    } catch (error) {
      console.error('Failed to load history:', error);
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  const handleImport = async () => {
    if (!selectedImage?.url) return;
    
    setIsImporting(true);
    setImportError(null);
    try {
      const response = await fetch('/api/import-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          imageUrl: selectedImage.url,
          altText: `Image generated from IMAI Studio - ${selectedImage.prompt || 'History item'}`
        })
      });
      
      const result = await response.json();
      
      if (result.ok) {
        setToastMessage(
          typeof result.message === "string"
            ? result.message
            : "Image imported to Shopify Files!",
        );
        setShowToast(true);
        setSelectedImage(null);
      } else {
        console.error('Import failed:', result.errors);
        setImportError(
          Array.isArray(result.errors) && result.errors.length
            ? result.errors.map((error: { message?: string }) => error.message).filter(Boolean).join(", ")
            : "Import failed. Check the server logs for details.",
        );
      }
    } catch (error) {
      console.error('Error importing image:', error);
      setImportError("Import failed. Check the server logs for details.");
    } finally {
      setIsImporting(false);
    }
  };

  const handleImageClick = (url: string, index: number, prompt?: string) => {
    setImportError(null);
    setSelectedImage({ url, prompt, index });
  };

  // Initial load and when endpoint changes
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Also refresh when refreshTrigger changes
  useEffect(() => {
    if (refreshTrigger) {
      loadHistory();
    }
  }, [loadHistory, refreshTrigger]);

  const validHistoryItems = history.filter((item) => {
    if (item.error) return false;

    return item.results.some((url) => !brokenImageUrls.has(url));
  });

  useEffect(() => {
    onHasVisibleHistoryChange?.(validHistoryItems.length > 0);
  }, [onHasVisibleHistoryChange, validHistoryItems.length]);

  if (loading && history.length === 0) {
    if (!showLoadingState) {
      return null;
    }

    return (
      <Card>
        <Box padding="400">
          <Text as="p" alignment="center" tone="subdued">
            Loading history...
          </Text>
        </Box>
      </Card>
    );
  }

  if (validHistoryItems.length === 0) {
    return null;
  }

  return (
    <Frame>
      <Card>
        <Box padding="400">
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Gen History</Text>
            <InlineGrid columns={{ xs: 1, sm: 2, lg: 3 }} gap="400">
              {validHistoryItems.map((item) => (
                <Box key={item.id} padding="300" background="bg-fill-secondary" borderRadius="200">
                  <BlockStack gap="200">
                    {item.results.filter((url) => !brokenImageUrls.has(url)).length > 0 && (
                      <InlineGrid columns={{ xs: 2 }} gap="200">
                        {item.results
                          .filter((url) => !brokenImageUrls.has(url))
                          .map((url, index) => (
                          <button
                            type="button"
                            key={index} 
                            onClick={() => handleImageClick(url, index, item.prompt)}
                            style={{
                              cursor: "pointer",
                              border: 0,
                              padding: 0,
                              background: "transparent",
                            }}
                          >
                            <div 
                              style={{ 
                                borderRadius: "8px", 
                                overflow: "hidden", 
                                aspectRatio: "1",
                                width: "100%"
                              }}
                            >
                              <img
                                src={url}
                                onError={() => markImageAsBroken(url)}
                                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                                alt={`Generated ${index + 1}`}
                              />
                            </div>
                          </button>
                        ))}
                      </InlineGrid>
                    )}

                    {item.response?.details?.title && (
                      <Text as="p" variant="headingSm" tone="subdued">
                        {item.response.details.title}
                      </Text>
                    )}
                  </BlockStack>
                </Box>
              ))}
            </InlineGrid>
          </BlockStack>
        </Box>
      </Card>

      <Modal
        open={!!selectedImage}
        onClose={() => setSelectedImage(null)}
        title="Preview"
        primaryAction={{
          content: isImporting ? "Importing..." : "Import to Shopify",
          onAction: handleImport,
          loading: isImporting,
        }}
      >
        <Modal.Section>
          <BlockStack gap="400">
            {selectedImage && (
              <>
                <img
                  src={selectedImage.url}
                  style={{ width: "100%", borderRadius: "8px" }}
                  alt="Preview"
                />
                {selectedImage.prompt && (
                  <Text as="p" tone="subdued">
                    Prompt: {selectedImage.prompt}
                  </Text>
                )}
                {importError && (
                  <Text as="p" tone="critical">
                    {importError}
                  </Text>
                )}
              </>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>

      {showToast && (
        <Toast
          content={toastMessage}
          onDismiss={() => setShowToast(false)}
        />
      )}
    </Frame>
  );
}
