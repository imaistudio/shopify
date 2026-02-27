import { useState, useCallback } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { decrypt } from "../lib/encryption.server";
import {
  Page,
  Card,
  Box,
  BlockStack,
  InlineStack,
  Text,
  Spinner,
  Banner,
} from "@shopify/polaris";

// Components
import { LibraryGrid } from "../components/LibraryGrid";
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
    maskedKey: storedKey?.maskedKey || null,
    balance,
  };
};

export default function LibraryPage() {
  const { shop, isConnected, balance } = useLoaderData<typeof loader>();
  const [libraryRefreshTrigger, setLibraryRefreshTrigger] = useState(0);

  const handleGenerationComplete = useCallback(() => {
    setLibraryRefreshTrigger((prev) => prev + 1);
  }, []);

  const primaryAction = isConnected ? (
    <CreditsBadge balance={balance} />
  ) : undefined;

  return (
    <Page title="Library" primaryAction={primaryAction}>
      <BlockStack gap="400">
        {!isConnected && (
          <Banner tone="info" title="Connect your IMAI Studio API key">
            <Text>
              Connect your API key in the Settings tab to start viewing your library.
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
              <LibraryGrid 
                refreshTrigger={libraryRefreshTrigger}
                shop={shop}
              />
            ) : (
              <BlockStack gap="400" alignment="center">
                <Text tone="subdued" alignment="center">
                  Connect your API key to view your library
                </Text>
              </BlockStack>
            )}
          </Box>
        </Card>
      </BlockStack>
    </Page>
  );
}
