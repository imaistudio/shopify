'use client';

import { InlineStack, Text, BlockStack } from "@shopify/polaris";

const masonryStyles = `
  .featured2-masonry {
    column-count: 2;
    column-gap: 12px;
    width: 100%;
    max-width: 100%;
  }
  .featured2-masonry-item {
    break-inside: avoid;
    margin-bottom: 12px;
    border-radius: 12px;
    overflow: hidden;
  }
  .featured2-masonry-item img {
    width: 100%;
    height: auto;
    display: block;
    object-fit: cover;
    vertical-align: middle;
  }
  @media (min-width: 600px) {
    .featured2-masonry {
      column-count: 3;
      column-gap: 14px;
    }
    .featured2-masonry-item {
      margin-bottom: 14px;
    }
  }
`;

export function Featured2block({
  title,
  description,
  images,
  reverse = false,
}: {
  title: string;
  description: string;
  images: string[];
  reverse?: boolean;
}) {
  return (
    <div>
      <style>{masonryStyles}</style>
      <InlineStack
        gap="600"
        align="center"
        wrap={false}
        direction={reverse ? "row-reverse" : "row"}
      >
        <div style={{ flex: 1, minWidth: 0, minHeight: 540 }}>
          <div className="featured2-masonry" style={{ minHeight: 540 }}>
            {images.map((src, i) => (
              <div key={i} className="featured2-masonry-item">
                <img src={src} alt={`${title} ${i + 1}`} loading="lazy" />
              </div>
            ))}
          </div>
        </div>
        <div
          style={{
            flex: 1,
            minHeight: 540,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: reverse ? "flex-end" : "flex-start",
            textAlign: reverse ? "right" : "left",
          }}
        >
          <BlockStack gap="500" inlineAlign={reverse ? "end" : "start"}>
            <Text as="h2" alignment={reverse ? "end" : "start"}>
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
                {title}
              </span>
            </Text>
            <Text as="p" alignment={reverse ? "end" : "start"}>
              <span style={{ fontSize: "28px", color: "#000" }}>
                {description}
              </span>
            </Text>
          </BlockStack>
        </div>
      </InlineStack>
    </div>
  );
}
