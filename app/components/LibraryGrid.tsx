import { useState, useEffect } from "react";
import {
  BlockStack,
  InlineGrid,
  Card,
  Text,
  Badge,
  Button,
  InlineStack,
  Tabs,
  Spinner,
  EmptyState,
  Pagination,
  Box,
  Modal,
  Toast,
  Frame,
} from "@shopify/polaris";

interface Asset {
  id: string;
  type: "image" | "video" | "3d";
  thumbnailUrl: string;
  url: string;
  createdAt: string;
  metadata?: {
    width?: number;
    height?: number;
  };
}

interface LibraryGridProps {
  refreshTrigger: number;
  shop: string;
}

export function LibraryGrid({ refreshTrigger, shop }: LibraryGridProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const fetchLibrary = async () => {
    setIsLoading(true);
    try {
      const type = "image";
      const offset = (page - 1) * 24;
      
      const resp = await fetch(
        `/api/imai/library?type=${type}&limit=24&offset=${offset}&shop=${shop}`
      );
      
      if (!resp.ok) {
        throw new Error("Failed to fetch library");
      }

      const data = await resp.json();
      
      // Merge chatGenerations and marketingGenerations, sort by createdAt
      const allAssets = [
        ...(data.chatGenerations || []),
        ...(data.marketingGenerations || []),
      ].sort((a: Asset, b: Asset) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      setAssets(allAssets);
      setHasMore(data.hasMore || false);
    } catch (err) {
      console.error("Error fetching library:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLibrary();
  }, [page, refreshTrigger]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const handleImport = async () => {
    if (!selectedAsset?.url) return;
    
    setIsImporting(true);
    try {
      const response = await fetch('/api/import-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          imageUrl: selectedAsset.url,
          filename: `imai-${selectedAsset.id}.jpg`,
          altText: `Image generated from IMAI Studio - ${selectedAsset.id}`
        })
      });
      
      const result = await response.json();
      
      if (result.ok) {
        setShowToast(true);
        setSelectedAsset(null);
      } else {
        console.error('Import failed:', result.errors);
      }
    } catch (error) {
      console.error('Error importing image:', error);
    } finally {
      setIsImporting(false);
    }
  };

  const handleRefresh = () => {
    fetchLibrary();
  };

  if (isLoading && assets.length === 0) {
    return (
      <BlockStack gap="400">
        <InlineGrid columns={{ xs: 2, sm: 3, md: 4 }} gap="300">
          {[...Array(8)].map((_, i) => (
            <Box
              key={i}
              minHeight="200px"
              borderRadius="200"
            />
          ))}
        </InlineGrid>
        <InlineStack align="end" blockAlign="center">
          <Button 
            onClick={handleRefresh} 
            disabled={isLoading}
            icon={isLoading ? <Spinner size="small" /> : undefined}
          >
            Refresh
          </Button>
        </InlineStack>
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
            icon={isLoading ? <Spinner size="small" /> : undefined}
          >
            Refresh
          </Button>
        </InlineStack>
      </BlockStack>
    );
  }

  return (
    <Frame>
      <BlockStack gap="100">
        <InlineGrid columns={{ xs: 2, sm: 3, md: 4 }} gap="300">
          {assets.map((asset) => (
            <div 
              key={asset.id} 
              onClick={() => setSelectedAsset(asset)}
              style={{ cursor: "pointer" }}
            >
              <Card padding="0">
                <Box>
                  <img
                    src={asset.url}
                    alt={asset.type}
                    onError={(e) => {
                      console.error('Image failed to load:', asset.url);
                      e.currentTarget.style.display = 'none';
                    }}
                    onLoad={() => {
                      console.log('Image loaded successfully:', asset.url);
                    }}
                    style={{
                      width: "100%",
                      height: "210px",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                </Box>
              </Card>
            </div>
          ))}
        </InlineGrid>

        <InlineStack align="space-between" blockAlign="center">
          <Pagination
            hasPrevious={page > 1}
            hasNext={hasMore}
            onPrevious={() => setPage((p) => p - 1)}
            onNext={() => setPage((p) => p + 1)}
            label={`Page ${page} · ${assets.length} assets shown`}
          />
          <Button 
            onClick={handleRefresh} 
            disabled={isLoading}
            icon={isLoading ? <Spinner size="small" /> : undefined}
          >
            Refresh
          </Button>
        </InlineStack>

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
            </BlockStack>
          </Modal.Section>
        </Modal>

        {showToast && (
          <Toast
            content="Image imported to Shopify Files!"
            onDismiss={() => setShowToast(false)}
          />
        )}
      </BlockStack>
    </Frame>
  );
}

function RefreshIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M13.3333 8.00004C13.3333 4.31804 10.682 1.66671 7 1.66671C4.54933 1.66671 2.414 3.13071 1.41667 5.24337M2.66667 8.00004C2.66667 11.682 5.318 14.3334 9 14.3334C11.4507 14.3334 13.586 12.8694 14.5833 10.7567M11.3333 5.24337H14.5833V1.99071M1.41667 10.7567V14.0094H4.66667"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
