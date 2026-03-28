import { useCallback } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { encrypt, decrypt, maskApiKey } from "../lib/encryption.server";
import {
  Page,
  Box,
  BlockStack,
  Banner,
  Text,
  Button,
  InlineStack,
  Card,
  Badge,
} from "@shopify/polaris";

// Components
import { SettingsBlock } from "../components/SettingsBlock";

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
        message: "IMAI API key connected successfully",
      };
    } catch (err) {
      return { error: "Network error. Could not reach IMAI Studio." };
    }
  }

  if (intent === "removeKey") {
    // Clean all IMAI data for this shop so adding a new key starts fresh
    await prisma.imaiJob.deleteMany({ where: { shop: session.shop } });
    await prisma.apiKey.delete({
      where: { shop: session.shop },
    });
    return { success: true, removed: true, message: "IMAI API key removed" };
  }

  return null;
};

export default function SettingsPage() {
  const { isConnected, maskedKey, balance } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  
  const handleKeySaved = useCallback(() => {
    // Key is saved, data will be updated via loader
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

  const error = fetcher.data?.error;
  const successMessage = fetcher.data?.success ? fetcher.data?.message : null;
  const isRemovingKey =
    fetcher.state === "submitting" &&
    fetcher.formData?.get("intent") === "removeKey";

  return (
    <Page title="Settings">
      <style>{`
        @media (max-width: 768px) {
          .settings-grid {
            grid-template-columns: 1fr !important;
            gap: 16px !important;
          }
        }
      `}</style>
      <BlockStack gap="400">
        {error && (
          <Banner tone="critical" title="Error">
            {error}
          </Banner>
        )}
        {successMessage && (
          <Banner tone="success" title="Success">
            {successMessage}
          </Banner>
        )}

        <Box paddingInlineStart="400" paddingInlineEnd="400">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "3fr 2fr",
              gap: 24,
              alignItems: "start",
            }}
            className="settings-grid"
          >
            <Card>
              <Box padding="400">
                {isConnected ? (
                  <BlockStack gap="300">
                    <InlineStack gap="200" blockAlign="center">
                      <Badge tone="success">Connected</Badge>
                    </InlineStack>

                    <InlineStack gap="200" blockAlign="center">
                      <Text as="span" variant="bodyMd" tone="subdued">
                        API Key
                      </Text>
                      <Text
                        as="span"
                        variant="headingLg"
                        fontWeight="medium"
                      >
                        {maskedKey}
                      </Text>
                    </InlineStack>

                    <div>
                      <Button
                        onClick={removeKey}
                        loading={isRemovingKey}
                        variant="primary"
                        tone="critical"
                      >
                        Remove Key
                      </Button>
                    </div>
                  </BlockStack>
                ) : (
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
              </Box>
            </Card>

            <Card>
              <Box padding="400">
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Credits Remaining
                  </Text>
                  <Text as="p" variant="headingLg" fontWeight="medium">
                    {balance === null ? "0" : balance.toLocaleString()}
                  </Text>
                </BlockStack>
              </Box>
            </Card>
          </div>
        </Box>
      </BlockStack>
    </Page>
  );
}
