import { useCallback, useEffect, useState } from "react";
import {
  BlockStack,
  InlineGrid,
  Card,
  Text,
  Button,
  InlineStack,
  Spinner,
  EmptyState,
  Box,
  Modal,
  Toast,
  Frame,
} from "@shopify/polaris";
import { authenticatedAppFetch } from "../lib/authenticated-app-fetch";

interface Asset {
  id: string;
  type: "image" | "video" | "3d";
  thumbnailUrl: string;
  url: string;
  createdAt: string;
  prompt?: string;
  productName?: string;
  versionName?: string;
  metadata?: {
    width?: number;
    height?: number;
    mimeType?: string;
  };
}

interface LibraryGridProps {
  refreshTrigger: number;
}

type LibraryResponse = {
  generations?: Asset[];
  pagination?: {
    hasMore?: boolean;
    nextCursor?: string | null;
  };
};

export function LibraryGrid({ refreshTrigger }: LibraryGridProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("Image imported to Shopify Files!");
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  const fetchLibrary = useCallback(async (currentCursor: string | null, resetCursor = false) => {
    setIsLoading(true);
    try {
      const endpoint = '/api/v1/library/marketing';
      
      const params = new URLSearchParams({
        numItems: '24',
        type: 'image',
        ...(currentCursor && { cursor: currentCursor })
      });
      
      const resp = await authenticatedAppFetch(`${endpoint}?${params}`);
      
      if (!resp.ok) {
        throw new Error("Failed to fetch library");
      }

      const data = (await resp.json()) as LibraryResponse;
      
      if (resetCursor) {
        setAssets(data.generations || []);
      } else {
        setAssets(prev => [...prev, ...(data.generations || [])]);
      }
      
      setHasMore(data.pagination?.hasMore || false);
      setCursor(data.pagination?.nextCursor || null);
    } catch (err) {
      console.error("Error fetching library:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    setCursor(null);
    setFailedImages(new Set());
    fetchLibrary(null, true);
  }, [fetchLibrary, refreshTrigger]);

  const handleImageError = (assetId: string, imageUrl: string) => {
    console.error('Image failed to load:', imageUrl);
    setFailedImages(prev => new Set(prev).add(assetId));
  };

  const handleImageLoad = (imageUrl: string) => {
    console.log('Image loaded successfully:', imageUrl);
  };

  const handleImport = async () => {
    if (!selectedAsset?.url) return;
    
    setIsImporting(true);
    setImportError(null);
    try {
      const response = await authenticatedAppFetch('/api/import-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          imageUrl: selectedAsset.url,
          altText: `Image generated from IMAI.Studio - ${selectedAsset.id}`
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
        setSelectedAsset(null);
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

  const handleLoadMore = () => {
    if (hasMore && !isLoading) {
      fetchLibrary(cursor, false);
    }
  };

  const handleRefresh = () => {
    setCursor(null);
    fetchLibrary(null, true);
  };

  if (isLoading && assets.length === 0) {
    return (
      <BlockStack gap="400">
        <Box padding="800">
          <InlineStack align="center" blockAlign="center">
            <Spinner size="large" />
          </InlineStack>
        </Box>
      </BlockStack>
    );
  }

  if (assets.length === 0 && !isLoading) {
    return (
      <BlockStack gap="400">
        <EmptyState
          heading="No assets yet"
          image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
        >
          <Text as="p">Generate your first image in the Generate tab.</Text>
        </EmptyState>
        <InlineStack align="end" blockAlign="center">
          <Button 
            onClick={handleRefresh} 
            disabled={isLoading}
          >
            Refresh
          </Button>
        </InlineStack>
      </BlockStack>
    );
  }

  return (
    <Frame>
      <div style={{ backgroundColor: 'white' }}>
        <BlockStack gap="400">
          <BlockStack gap="100">
            <InlineGrid columns={{ xs: 2, sm: 3, md: 4 }} gap="300">
              {assets.filter(asset => !failedImages.has(asset.id)).map((asset) => (
                <button
                  type="button"
                  key={asset.id} 
                  onClick={() => {
                    setImportError(null);
                    setSelectedAsset(asset);
                  }}
                  style={{
                    cursor: "pointer",
                    border: 0,
                    padding: 0,
                    background: "transparent",
                    textAlign: "left",
                  }}
                >
                  <Card padding="0">
                    <Box>
                      <img
                        src={asset.thumbnailUrl || asset.url}
                        alt={asset.type}
                        onError={() => handleImageError(asset.id, asset.thumbnailUrl || asset.url)}
                        onLoad={() => handleImageLoad(asset.thumbnailUrl || asset.url)}
                        style={{
                          width: "100%",
                          height: "210px",
                          objectFit: "cover",
                          display: "block",
                        }}
                      />
                    </Box>
                  </Card>
                </button>
              ))}
            </InlineGrid>

            <BlockStack gap="400" align="center">
              {hasMore && (
                <Box paddingBlockStart="600">
                  <BlockStack gap="200" align="center">
                    {isLoading && (
                      <InlineStack align="center">
                        <Spinner size="small" />
                      </InlineStack>
                    )}
                    <InlineStack align="center">
                      <Button 
                        onClick={handleLoadMore} 
                        disabled={isLoading}
                        fullWidth={false}
                      >
                        Load More
                      </Button>
                    </InlineStack>
                  </BlockStack>
                </Box>
              )}
              {assets.length > 0 && (
                <InlineStack align="center">
                  <Text as="p" variant="bodySm" tone="subdued">
                    {assets.length} assets shown
                  </Text>
                </InlineStack>
              )}
            </BlockStack>
          </BlockStack>
        </BlockStack>
      </div>

      <Modal
        open={!!selectedAsset}
        onClose={() => setSelectedAsset(null)}
        title="Preview"
        primaryAction={{
          content: isImporting ? "Importing..." : "Import",
          onAction: handleImport,
          loading: isImporting,
        }}
      >
        <Modal.Section>
          <BlockStack gap="400">
            {selectedAsset && (
              <img
                src={selectedAsset.url}
                style={{ width: "100%", borderRadius: "8px" }}
                alt="Preview"
              />
            )}
            {importError && (
              <Text as="p" tone="critical">
                {importError}
              </Text>
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
