import { useState, useCallback } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { encrypt, decrypt, maskApiKey } from "../lib/encryption.server";
import {
  Page,
  Tabs,
  Card,
  Box,
  BlockStack,
  InlineStack,
  Text,
  Spinner,
  Banner,
} from "@shopify/polaris";

// Components
import { SettingsBlock } from "../components/SettingsBlock";
import { LibraryGrid } from "../components/LibraryGrid";
import { GeneratePanel } from "../components/GeneratePanel";
import { CreditsBadge } from "../components/CreditsBadge";

// Hooks
import { useApiKey } from "../hooks/useApiKey";

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

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  // API Key management actions
  if (intent === "saveKey") {
    const apiKey = formData.get("apiKey") as string;
    
    // Validate key with IMAI API
    try {
      const healthCheck = await fetch("https://www.imai.studio/api/v1/health");
      if (!healthCheck.ok) {
        return { error: "Could not reach IMAI Studio" };
      }

      const creditsResp = await fetch("https://www.imai.studio/api/v1/credits", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (creditsResp.status === 401) {
        return { error: "Invalid API key" };
      }

      if (creditsResp.status === 403) {
        return { 
          error: "Key is missing required scopes: credits:read, library:read, generate:write" 
        };
      }

      if (!creditsResp.ok) {
        return { error: "Could not validate API key" };
      }

      const creditsData = await creditsResp.json();
      
      // Encrypt and store the key in database
      const encryptedKey = encrypt(apiKey);
      const maskedKey = maskApiKey(apiKey);
      
      await prisma.apiKey.upsert({
        where: { shop: session.shop },
        update: {
          encryptedKey,
          maskedKey,
          balance: creditsData.balance || 0,
        },
        create: {
          shop: session.shop,
          encryptedKey,
          maskedKey,
          balance: creditsData.balance || 0,
        },
      });
      
      return { 
        success: true, 
        maskedKey,
        balance: creditsData.balance || 0,
      };
    } catch (err) {
      return { error: "Network error. Could not reach IMAI Studio." };
    }
  }

  if (intent === "removeKey") {
    // Delete the key from database
    await prisma.apiKey.delete({
      where: { shop: session.shop },
    });
    return { success: true, removed: true };
  }

  return null;
};

export default function IMAIStudioIndex() {
  const { shop, isConnected, maskedKey, balance } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  
  const [selectedTab, setSelectedTab] = useState(0);
  const [libraryRefreshTrigger, setLibraryRefreshTrigger] = useState(0);

  const handleKeySaved = useCallback(() => {
    // Key is saved, data will be updated via loader
  }, []);

  const handleGenerationComplete = useCallback(() => {
    setLibraryRefreshTrigger((prev) => prev + 1);
  }, []);

  const saveKey = useCallback((apiKey: string) => {
    fetcher.submit(
      { intent: "saveKey", apiKey },
      { method: "post" }
    );
  }, [fetcher]);

  const removeKey = useCallback(() => {
    fetcher.submit(
      { intent: "removeKey" },
      { method: "post" }
    );
  }, [fetcher]);

  const tabs = [
    {
      id: "library",
      content: "Library",
      accessibilityLabel: "Library",
      panelID: "library-panel",
    },
    {
      id: "generate",
      content: "Generate",
      accessibilityLabel: "Generate",
      panelID: "generate-panel",
    },
    {
      id: "settings",
      content: "Settings",
      accessibilityLabel: "Settings",
      panelID: "settings-panel",
    },
  ];

  // If not connected, force settings tab
  const effectiveTab = isConnected ? selectedTab : 2;

  const primaryAction = isConnected ? (
    <CreditsBadge balance={balance} />
  ) : undefined;

  const isLoading = fetcher.state === "submitting";
  const error = fetcher.data?.error;

  return (
    <Page title="IMAI Studio" primaryAction={primaryAction}>
      <BlockStack gap="400">
        {!isConnected && (
          <Banner tone="info" title="Connect your IMAI Studio API key">
            <Text>
              Connect your API key in the Settings tab to start generating images.
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

        {error && (
          <Banner tone="critical" title="Error">
            {error}
          </Banner>
        )}

        <Tabs
          tabs={tabs}
          selected={effectiveTab}
          onSelect={setSelectedTab}
          disabled={!isConnected && selectedTab !== 2}
        >
          <Card>
            <Box padding="400">
              {isLoading ? (
                <InlineStack gap="200" blockAlign="center">
                  <Spinner size="small" />
                  <Text>Loading...</Text>
                </InlineStack>
              ) : (
                <>
                  {effectiveTab === 0 && isConnected && (
                    <LibraryGrid 
                      refreshTrigger={libraryRefreshTrigger}
                      shop={shop}
                    />
                  )}
                  {effectiveTab === 0 && !isConnected && (
                    <BlockStack gap="400" alignment="center">
                      <Text tone="subdued" alignment="center">
                        Connect your API key to view your library
                      </Text>
                    </BlockStack>
                  )}
                  
                  {effectiveTab === 1 && isConnected && (
                    <GeneratePanel 
                      onGenerationComplete={handleGenerationComplete}
                      shop={shop}
                    />
                  )}
                  {effectiveTab === 1 && !isConnected && (
                    <BlockStack gap="400" alignment="center">
                      <Text tone="subdued" alignment="center">
                        Connect your API key to generate images
                      </Text>
                    </BlockStack>
                  )}
                  
                  {effectiveTab === 2 && (
                    <SettingsBlock
                      isConnected={isConnected}
                      maskedKey={maskedKey}
                      balance={balance}
                      onSaveKey={saveKey}
                      onRemoveKey={removeKey}
                      isLoading={fetcher.state === "submitting"}
                      error={fetcher.data?.error}
                      onKeySaved={handleKeySaved}
                    />
                  )}
                </>
              )}
            </Box>
          </Card>
        </Tabs>
      </BlockStack>
    </Page>
  );
}
