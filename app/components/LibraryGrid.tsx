import { useState, useEffect } from "react";
import {
  BlockStack,
  InlineGrid,
  Card,
  Thumbnail,
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
  const [selectedTab, setSelectedTab] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [showToast, setShowToast] = useState(false);

  const tabs = [
    { id: "all", content: "All" },
    { id: "image", content: "Images" },
    { id: "video", content: "Videos" },
    { id: "3d", content: "3D" },
  ];

  const fetchLibrary = async () => {
    setIsLoading(true);
    try {
      const type = tabs[selectedTab].id === "all" ? "" : tabs[selectedTab].id;
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
  }, [selectedTab, page, refreshTrigger]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const handleCopyUrl = () => {
    if (selectedAsset?.url) {
      navigator.clipboard.writeText(selectedAsset.url);
      setShowToast(true);
    }
  };

  const handleRefresh = () => {
    fetchLibrary();
  };

  if (isLoading && assets.length === 0) {
    return (
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab} />
          <Button onClick={handleRefresh} icon={<RefreshIcon />}>
            Refresh
          </Button>
        </InlineStack>
        <InlineGrid columns={{ xs: 2, sm: 3, md: 4 }} gap="300">
          {[...Array(8)].map((_, i) => (
            <Box
              key={i}
              background="bg-surface-secondary"
              minHeight="200px"
              borderRadius="200"
            />
          ))}
        </InlineGrid>
      </BlockStack>
    );
  }

  if (assets.length === 0 && !isLoading) {
    return (
      <BlockStack gap="400">
        <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab} />
        <EmptyState
          heading="No assets yet"
          image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
        >
          <Text>Generate your first image in the Generate tab.</Text>
        </EmptyState>
      </BlockStack>
    );
  }

  return (
    <Frame>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab} />
          <Button onClick={handleRefresh} disabled={isLoading}>
            {isLoading ? <Spinner size="small" /> : "Refresh"}
          </Button>
        </InlineStack>

        <InlineGrid columns={{ xs: 2, sm: 3, md: 4 }} gap="300">
          {assets.map((asset) => (
            <Card key={asset.id} padding="0">
              <Box>
                <img
                  src={asset.thumbnailUrl}
                  alt={asset.type}
                  style={{
                    width: "100%",
                    height: "150px",
                    objectFit: "cover",
                    display: "block",
                  }}
                />
                <Box padding="200">
                  <BlockStack gap="100">
                    <Badge>{asset.type}</Badge>
                    <Text variant="bodySm" tone="subdued">
                      {formatDate(asset.createdAt)}
                    </Text>
                    <Button
                      size="slim"
                      onClick={() => setSelectedAsset(asset)}
                    >
                      Preview
                    </Button>
                  </BlockStack>
                </Box>
              </Box>
            </Card>
          ))}
        </InlineGrid>

        <Pagination
          hasPrevious={page > 1}
          hasNext={hasMore}
          onPrevious={() => setPage((p) => p - 1)}
          onNext={() => setPage((p) => p + 1)}
          label={`Page ${page} · ${assets.length} assets shown`}
        />

        <Modal
          open={!!selectedAsset}
          onClose={() => setSelectedAsset(null)}
          title="Asset Preview"
          primaryAction={{
            content: "Copy URL",
            onAction: handleCopyUrl,
          }}
          secondaryActions={[
            { content: "Close", onAction: () => setSelectedAsset(null) },
          ]}
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
              <InlineStack gap="200">
                <Badge>{selectedAsset?.type}</Badge>
                <Text tone="subdued">
                  {selectedAsset?.metadata?.width}×
                  {selectedAsset?.metadata?.height}
                </Text>
              </InlineStack>
            </BlockStack>
          </Modal.Section>
        </Modal>

        {showToast && (
          <Toast
            content="URL copied to clipboard!"
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
