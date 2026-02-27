import { Page, Card, Box, BlockStack, Text } from "@shopify/polaris";

export default function DesignPage() {
  return (
    <Page title="Design">
      <BlockStack gap="400">
        <Card>
          <Box padding="400">
            <BlockStack gap="400" alignment="center">
              <Text variant="headingMd" as="h2">
                Design Tools
              </Text>
              <Text alignment="center">
                Create stunning designs with AI-powered tools
              </Text>
            </BlockStack>
          </Box>
        </Card>
      </BlockStack>
    </Page>
  );
}
