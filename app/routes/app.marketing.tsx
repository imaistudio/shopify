import { useState, useCallback } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { decrypt } from "../lib/encryption.server";
import {
  Page,
  Card,
  Box,
  BlockStack,
  Text,
  Banner,
} from "@shopify/polaris";

// Components
import { GeneratePanel } from "../components/GeneratePanel";
import { History } from "../components/History";

const marketingMasonryColumns = [
  [
    { src: "/block1/1.webp", alt: "Media Studio sample 1" },
    { src: "/block1/5.webp", alt: "Media Studio sample 5" },
  ],
  [
    { src: "/block1/2.webp", alt: "Media Studio sample 2" },
    { src: "/block1/6.webp", alt: "Media Studio sample 6" },
  ],
  [
    { src: "/block1/3.webp", alt: "Media Studio sample 3" },
    { src: "/block1/7.webp", alt: "Media Studio sample 7" },
  ],
  [{ src: "/block1/4.webp", alt: "Media Studio sample 4" }],
] as const;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  
  // Check if shop has a stored API key
  const storedKey = await prisma.apiKey.findUnique({
    where: { shop: session.shop },
  });
  
  let balance = null;
  if (storedKey) {
    try {
      const apiKey = decrypt(storedKey.encryptedKey);
      const creditsResp = await fetch("https://www.imai.studio/api/v1/credits", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (creditsResp.ok) {
        const creditsData = await creditsResp.json();
        balance = creditsData.balance;
      }
    } catch (error) {
      console.error("Failed to fetch balance:", error);
    }
  }
  
  return { 
    shop: session.shop,
    isConnected: !!storedKey,
    balance,
  };
};

export default function MarketingPage() {
  const { shop, isConnected, balance } = useLoaderData<typeof loader>();
  const [libraryRefreshTrigger, setLibraryRefreshTrigger] = useState(0);

  const handleGenerationComplete = useCallback(() => {
    setLibraryRefreshTrigger((prev) => prev + 1);
  }, []);

  const primaryAction = undefined;

  return (
    <Page title="Media Studio" primaryAction={primaryAction}>
      <style>{`
        .marketing-masonry {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 16px;
          align-items: start;
        }

        .marketing-masonry-column {
          display: grid;
          gap: 16px;
          align-content: start;
        }

        .marketing-masonry-image {
          width: 100%;
          height: auto;
          display: block;
          border-radius: 16px;
        }

        @media (max-width: 1024px) {
          .marketing-masonry {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 640px) {
          .marketing-masonry {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
      <BlockStack gap="400">
        <Box paddingBlockEnd="200" style={{ marginTop: '-20px' }}>
          <Text as="p" tone="subdued">
            Generate eye-catching photos for your social media in seconds. Upload a reference image or describe your idea and let AI create ready-to-post visuals.
          </Text>
        </Box>
        {/* First Banner - Top of Page */}
        <Card>
          <Box padding="400">
            <img 
              src="/media/marketing.webp" 
              alt="Marketing Generation Banner"
              style={{ 
                width: "100%", 
                height: "auto", 
                borderRadius: "12px",
                objectFit: "cover"
              }}
            />
          </Box>
        </Card>

        {!isConnected && (
          <Banner tone="info" title="Connect your IMAI Studio API key">
            <Text as="p">
              Connect your API key in the Settings tab to start generating marketing images.
              Get your key at{" "}
              <a href="https://www.imai.studio" target="_blank" rel="noopener noreferrer">
                www.imai.studio
              </a>
            </Text>
          </Banner>
        )}

        <Card>
          <Box padding="400">
            {isConnected ? (
                <GeneratePanel 
                  onGenerationComplete={handleGenerationComplete}
                  shop={shop}
                  defaultMode="marketing"
                  balance={balance}
                  promptPlaceholder='e.g. "Instagram lifestyle photo with soft lighting" or "Modern product post with pastel background"'
                />
              ) : (
                <BlockStack gap="400" align="center">
                  <Text as="p" tone="subdued" alignment="center">
                    Connect your API key to generate marketing images
                  </Text>
                </BlockStack>
              )}
          </Box>
        </Card>

        {/* Second Banner - Above History */}
        <Card>
          <Box padding="400">
            <div className="marketing-masonry">
              {marketingMasonryColumns.map((column, columnIndex) => (
                <div className="marketing-masonry-column" key={`marketing-column-${columnIndex}`}>
                  {column.map((image) => (
                    <img
                      key={image.src}
                      className="marketing-masonry-image"
                      src={image.src}
                      alt={image.alt}
                      loading="lazy"
                    />
                  ))}
                </div>
              ))}
            </div>
          </Box>
        </Card>

        {isConnected && (
          <History 
            shop={shop} 
            refreshTrigger={libraryRefreshTrigger}
          />
        )}
      </BlockStack>
    </Page>
  );
}
