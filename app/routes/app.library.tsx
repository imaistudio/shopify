import { useState, useCallback } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  Page,
  Card,
  Box,
  BlockStack,
  Text,
  Banner,
} from "@shopify/polaris";

// Components
import { LibraryGrid } from "../components/LibraryGrid";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  
  // Check if shop has a stored API key
  const storedKey = await prisma.apiKey.findUnique({
    where: { shop: session.shop },
  });
  
  return { 
    shop: session.shop,
    isConnected: !!storedKey,
    maskedKey: storedKey?.maskedKey || null,
  };
};

export default function LibraryPage() {
  const { shop, isConnected } = useLoaderData<typeof loader>();
  const [libraryRefreshTrigger, setLibraryRefreshTrigger] = useState(0);

  const handleGenerationComplete = useCallback(() => {
    setLibraryRefreshTrigger((prev) => prev + 1);
  }, []);

  return (
    <Page title="Library">
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
