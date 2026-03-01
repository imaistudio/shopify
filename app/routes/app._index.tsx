'use client';
import { Page, Box, InlineStack, Text } from "@shopify/polaris";
import { AutoGallery } from "../../components/AutoGallery";

export default function HomePage() {
  return (
    <Page fullWidth>
      <Box paddingInline="800" paddingBlock="1600">
        <InlineStack gap="800" align="start" blockAlign="center" wrap={false}>
          {/* Left Column - Large stacked headline */}
          <Box minWidth="340px" maxWidth="380px">
            <div style={{ lineHeight: 0.9 }}>
              <Text variant="heading2xl" as="h1" fontWeight="bold">
                <span
                  style={{
                    fontSize: "clamp(54px, 8vw, 96px)",
                    fontWeight: 900,
                    lineHeight: 0.92,
                    letterSpacing: "-2px",
                    display: "block",
                    color: "#000",
                  }}
                >
                  AI
                  <br />
                  THAT
                  <br />
                  SELLS
                </span>
              </Text>
            </div>
            <Box paddingBlockStart="400">
              <Text variant="bodyLg" as="p" tone="subdued">
                <span style={{ fontSize: "28px", color: "#000" }}>
                  Create high-impact visuals that turn visitors into buyers.
                </span>
              </Text>
            </Box>
          </Box>

          {/* Right - AutoGallery */}
          <AutoGallery />
        </InlineStack>
      </Box>
    </Page>
  );
}