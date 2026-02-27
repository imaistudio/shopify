import { Page, Box, BlockStack, Text } from "@shopify/polaris";

export default function HomePage() {
  return (
    <Page>
      <Box padding="800">
        <BlockStack gap="400" align="center">
          <Text variant="heading2xl" as="h1" alignment="center">
            Images that capture views and convert to sales
          </Text>
        </BlockStack>
      </Box>
    </Page>
  );
}
