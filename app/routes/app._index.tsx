'use client';
import {
  Page,
  Box,
  InlineStack,
  Text,
  Card,
  BlockStack,
} from "@shopify/polaris";
import { AutoGallery } from "../../components/AutoGallery";
import { Featured2block } from "../../components/Featured2block";

function FeatureBlock({
  title,
  description,
  image,
  reverse = false,
}: {
  title: string;
  description: string;
  image: string;
  reverse?: boolean;
}) {
  return (
    <Card>
      <InlineStack
        gap="600"
        align="center"
        wrap={false}
        direction={reverse ? "row-reverse" : "row"}
      >
        <div style={{ flex: 1 }}>
          <img
            src={image}
            alt={title}
            style={{
              width: "100%",
              borderRadius: "12px",
              objectFit: "cover",
            }}
          />
        </div>
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
          }}
        >
          <BlockStack gap="400" inlineAlign="center">
            <Text variant="headingLg" as="h2" alignment="center">
              {title}
            </Text>
            <Text variant="bodyMd" as="p" tone="subdued" alignment="center">
              {description}
            </Text>
          </BlockStack>
        </div>
      </InlineStack>
    </Card>
  );
}

export default function HomePage() {
  return (
    <Page fullWidth>
      <Box paddingInline="800" paddingBlock="1600">
        <BlockStack gap="1200">
          {/* Hero: headline + AutoGallery */}
          <Box>
            <InlineStack
              gap="800"
              align="start"
              blockAlign="center"
              wrap={false}
            >
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

          {/* Section 1: Masonry gallery left, text right */}
          <Featured2block
          title="MEDIA STUDIO"
            description="Generate eye-catching photos for your store in seconds."
            images={[
              "/block1/1.webp",
              "/block1/2.webp",
              "/block1/3.webp",
              "/block1/4.webp",
              "/block1/5.webp",
              "/block1/6.webp",
              "/block1/7.webp",
            ]}
          />

          {/* Section 2: Text left, masonry gallery right (reverse) */}
          <Featured2block
            reverse
            title="PRODUCT STUDIO"
            description="Create professional product photos for your store."
            images={[
             "/block2/1.webp",
              "/block2/2.webp",
              "/block2/3.webp",
              "/block2/4.webp",
              "/block2/5.webp",
              "/block2/6.webp",
              "/block2/7.webp",
            ]}
          />
        </BlockStack>
      </Box>
    </Page>
  );
}