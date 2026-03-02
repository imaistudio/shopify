import { useState, useEffect } from "react";
import {
  Card,
  Box,
  BlockStack,
  Text,
  InlineGrid,
  Modal,
  Toast,
  Frame,
  Button,
  Spinner,
} from "@shopify/polaris";

interface HistoryItem {
  id: string;
  prompt: string;
  results: string[] | null;
  error?: string | null;
  response?: any; // For product generation responses
}

interface SelectedImage {
  url: string;
  prompt?: string;
  index: number;
}

interface HistoryProps {
  shop: string;
  refreshTrigger?: number;
}

export function History({ shop, refreshTrigger }: HistoryProps) {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const handleImport = async () => {
    if (!selectedImage?.url) return;
    
    setIsImporting(true);
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
        setShowToast(true);
        setSelectedImage(null);
      } else {
        console.error('Import failed:', result.errors);
      }
    } catch (error) {
      console.error('Error importing image:', error);
    } finally {
      setIsImporting(false);
    }
  };

  const handleImageClick = (url: string, index: number, prompt?: string) => {
    setSelectedImage({ url, prompt, index });
  };

  useEffect(() => {
    const loadHistory = async () => {
      try {
        setLoading(true);
        const resp = await fetch('/api/imai/history');
        if (resp.ok) {
          const data = await resp.json();
          setHistory(data.map((h: any) => ({
            id: `history-${h.id}`,
            prompt: h.prompt,
            results: h.results || null,
            response: h.response || null,
            error: null,
          })));
        }
      } catch (error) {
        console.error('Failed to load history:', error);
      } finally {
        setLoading(false);
      }
    };
    loadHistory();
  }, [shop]); // Only depend on shop, not refreshTrigger

  if (loading) {
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

  if (history.length === 0) {
    return (
      <Card>
        <Box padding="400">
          <Text as="p" alignment="center" tone="subdued">
            No generation history yet
          </Text>
        </Box>
      </Card>
    );
  }

  // Filter out items that have no images or have errors
  const validHistoryItems = history.filter(item => {
    // Check if item has error
    if (item.error) return false;
    
    // Check if item has regular image results
    if (item.results && item.results.length > 0) return true;
    
    // Check if item has product generation response with images
    if (item.response?.images?.urls && item.response.images.urls.length > 0) return true;
    
    return false;
  });

  if (validHistoryItems.length === 0) {
    return (
      <Card>
        <Box padding="400">
          <Text as="p" alignment="center" tone="subdued">
            No generation history yet
          </Text>
        </Box>
      </Card>
    );
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
                    {/* Handle regular image results */}
                    {item.results && item.results.length > 0 && (
                      <InlineGrid columns={{ xs: 2 }} gap="200">
                        {item.results.map((url, index) => (
                          <div 
                            key={index} 
                            onClick={() => handleImageClick(url, index, item.prompt)}
                            style={{ cursor: "pointer" }}
                          >
                            <Box borderRadius="200" overflowX="hidden">
                              <img
                                src={url}
                                style={{ width: "100%", display: "block" }}
                                alt={`Generated ${index + 1}`}
                              />
                            </Box>
                          </div>
                        ))}
                      </InlineGrid>
                    )}
                    
                    {/* Handle product generation responses */}
                    {item.response && (
                      <BlockStack gap="200">
                        {item.response.images?.urls && item.response.images.urls.length > 0 && (
                          <InlineGrid columns={{ xs: 2 }} gap="200">
                            {item.response.images.urls.map((url: string, index: number) => (
                              <div 
                                key={index} 
                                onClick={() => handleImageClick(url, index, item.prompt)}
                                style={{ cursor: "pointer" }}
                              >
                                <Box borderRadius="200" overflowX="hidden">
                                  <img
                                    src={url}
                                    style={{ width: "100%", display: "block" }}
                                    alt={`Generated ${index + 1}`}
                                  />
                                </Box>
                              </div>
                            ))}
                          </InlineGrid>
                        )}
                        
                        {item.response.details?.title && (
                          <Text as="p" variant="headingSm" tone="subdued">
                            {item.response.details.title}
                          </Text>
                        )}
                      </BlockStack>
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
              </>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>

      {showToast && (
        <Toast
          content="Image imported to Shopify Files!"
          onDismiss={() => setShowToast(false)}
        />
      )}
    </Frame>
  );
}
