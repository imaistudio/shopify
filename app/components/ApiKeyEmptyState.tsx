import {
  Banner,
  BlockStack,
  Box,
  Card,
  Text,
} from "@shopify/polaris";

interface ApiKeyEmptyStateProps {
  bannerText: string;
  emptyText: string;
}

export function ApiKeyEmptyState({
  bannerText,
  emptyText,
}: ApiKeyEmptyStateProps) {
  return (
    <BlockStack gap="400">
      <Banner tone="info" title="Connect your IMAI Studio API key">
        <Text as="p">
          {bannerText} Get your key at{" "}
          <a
            href="https://www.imai.studio"
            target="_blank"
            rel="noopener noreferrer"
          >
            www.imai.studio
          </a>
        </Text>
      </Banner>

      <Card>
        <Box padding="400">
          <BlockStack gap="400">
            <Text as="p" tone="subdued" alignment="center">
              {emptyText}
            </Text>
          </BlockStack>
        </Box>
      </Card>
    </BlockStack>
  );
}
