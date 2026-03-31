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
} from "@shopify/polaris";

// Components
import { ApiKeyEmptyState } from "../components/ApiKeyEmptyState";
import { GeneratePanel } from "../components/GeneratePanel";
import { History } from "../components/History";

const marketingMasonryColumns = [
  [
    { src: "/block1/1.webp", alt: "Media Agent sample 1" },
    { src: "/block1/5.webp", alt: "Media Agent sample 5" },
  ],
  [
    { src: "/block1/2.webp", alt: "Media Agent sample 2" },
    { src: "/block1/6.webp", alt: "Media Agent sample 6" },
  ],
  [
    { src: "/block1/3.webp", alt: "Media Agent sample 3" },
    { src: "/block1/7.webp", alt: "Media Agent sample 7" },
  ],
  [{ src: "/block1/4.webp", alt: "Media Agent sample 4" }],
] as const;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  
  // Check if shop has a stored API key
  const storedKey = await prisma.apiKey.findUnique({
    where: { shop: session.shop },
  });
  
  let balance = null;
  let hasHistory = false;
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

    const existingHistory = await prisma.imaiJob.findFirst({
      where: {
        shop: session.shop,
        status: "completed",
        endpoint: "marketing",
      },
      select: { id: true },
    });

    hasHistory = !!existingHistory;
  }
  
  return { 
    shop: session.shop,
    isConnected: !!storedKey,
    balance,
    hasHistory,
  };
};

export default function MarketingPage() {
  const {
    isConnected,
    balance,
    hasHistory: initialHasHistory,
  } = useLoaderData<typeof loader>();
  const [libraryRefreshTrigger, setLibraryRefreshTrigger] = useState(0);
  const [hasPageHistory, setHasPageHistory] = useState(initialHasHistory);

  const handleGenerationComplete = useCallback(() => {
    setLibraryRefreshTrigger((prev) => prev + 1);
  }, []);

  const handleHistoryVisibilityChange = useCallback((hasVisibleHistory: boolean) => {
    setHasPageHistory(hasVisibleHistory);
  }, []);

  const primaryAction = undefined;

  if (!isConnected) {
    return (
      <Page title="Media Agent" primaryAction={primaryAction}>
        <ApiKeyEmptyState
          bannerText="Connect your API key in the Settings tab to start generating marketing images."
          emptyText="Connect your API key to view Media Agent content"
        />
      </Page>
    );
  }

  return (
    <Page title="Media Agent" primaryAction={primaryAction}>
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
        <div style={{ marginTop: "-20px" }}>
          <Box paddingBlockEnd="200">
            <Text as="p" tone="subdued">
              Use the Media Agent to generate campaign-ready visuals for social, ads, and storefront placements. Upload a reference image or describe the outcome, and let the agent produce ready-to-publish variations.
            </Text>
          </Box>
        </div>
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

        <Card>
          <Box padding="400">
            <GeneratePanel 
              onGenerationComplete={handleGenerationComplete}
              balance={balance}
              promptPlaceholder='e.g. "Instagram lifestyle photo with soft lighting" or "Modern product post with pastel background"'
              promptHelpText="Give the Media Agent the channel, visual style, and mood so it can steer the output with less guesswork."
            />
          </Box>
        </Card>

        <History 
          endpoint="marketing"
          refreshTrigger={libraryRefreshTrigger}
          onHasVisibleHistoryChange={handleHistoryVisibilityChange}
          showLoadingState={hasPageHistory}
        />
      </BlockStack>
    </Page>
  );
}
