import { useState, useEffect } from "react";
import {
  Card,
  Box,
  BlockStack,
  Text,
  InlineGrid,
} from "@shopify/polaris";

interface HistoryItem {
  id: string;
  prompt: string;
  results: string[] | null;
  error?: string | null;
  response?: any; // For product generation responses
}

interface HistoryProps {
  shop: string;
  refreshTrigger?: number;
}

export function History({ shop, refreshTrigger }: HistoryProps) {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

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
  }, [shop, refreshTrigger]);

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
                        <Box key={index} borderRadius="200" overflowX="hidden">
                          <img
                            src={url}
                            style={{ width: "100%", display: "block" }}
                            alt={`Generated ${index + 1}`}
                          />
                        </Box>
                      ))}
                    </InlineGrid>
                  )}
                  
                  {/* Handle product generation responses */}
                  {item.response && (
                    <BlockStack gap="200">
                      {item.response.images?.urls && item.response.images.urls.length > 0 && (
                        <InlineGrid columns={{ xs: 2 }} gap="200">
                          {item.response.images.urls.map((url: string, index: number) => (
                            <Box key={index} borderRadius="200" overflowX="hidden">
                              <img
                                src={url}
                                style={{ width: "100%", display: "block" }}
                                alt={`Generated ${index + 1}`}
                              />
                            </Box>
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
  );
}
