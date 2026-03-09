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
import { CreditsBadge } from "../components/CreditsBadge";
import { History } from "../components/History";

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
            <img 
              src="/media/marketing2.webp" 
              alt="Marketing History Banner"
              style={{ 
                width: "100%", 
                height: "auto", 
                borderRadius: "12px",
                objectFit: "cover"
              }}
            />
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
