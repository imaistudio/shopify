import { Page, Card, Box, BlockStack, Text } from "@shopify/polaris";

export default function MarketingPage() {
  return (
    <Page title="Marketing">
      <BlockStack gap="400">
        <Card>
          <Box padding="400">
            <BlockStack gap="400" align="center">
              <Text variant="headingMd" as="h2">
                Marketing Tools
              </Text>
              <Text alignment="center">
                Boost your marketing with AI-generated content
              </Text>
            </BlockStack>
          </Box>
        </Card>
      </BlockStack>
    </Page>
  );
}
