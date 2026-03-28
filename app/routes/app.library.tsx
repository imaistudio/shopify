import { useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  Page,
  Card,
  Box,
} from "@shopify/polaris";

// Components
import { ApiKeyEmptyState } from "../components/ApiKeyEmptyState";
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
  const { isConnected } = useLoaderData<typeof loader>();
  const [libraryRefreshTrigger] = useState(0);

  return (
    <Page title="Library">
      {isConnected ? (
        <Card>
          <Box padding="400">
            <LibraryGrid refreshTrigger={libraryRefreshTrigger} />
          </Box>
        </Card>
      ) : (
        <ApiKeyEmptyState
          bannerText="Connect your API key in the Settings tab to start viewing your library."
          emptyText="Connect your API key to view your library"
        />
      )}
    </Page>
  );
}
