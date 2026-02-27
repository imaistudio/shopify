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

  const primaryAction = isConnected ? (
    <CreditsBadge balance={balance} />
  ) : undefined;

  return (
    <Page title="Marketing" primaryAction={primaryAction}>
      <BlockStack gap="400">
        {!isConnected && (
          <Banner tone="info" title="Connect your IMAI Studio API key">
            <Text>
              Connect your API key in the Settings tab to start generating marketing images.
              Get your key at{" "}
              <a href="https://www.imai.studio" target="_blank" rel="noopener noreferrer">
                www.imai.studio
              </a>
            </Text>
          </Banner>
        )}

        {isConnected && balance !== null && balance < 100 && (
          <Banner tone="warning" title="Low credits">
            <Text>
              You have fewer than 100 credits remaining. Top up at{" "}
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
              />
            ) : (
              <BlockStack gap="400" align="center">
                <Text tone="subdued" alignment="center">
                  Connect your API key to generate marketing images
                </Text>
              </BlockStack>
            )}
          </Box>
        </Card>
      </BlockStack>
    </Page>
  );
}
