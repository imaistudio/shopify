import { useCallback } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { encrypt, decrypt, maskApiKey } from "../lib/encryption.server";
import {
  Page,
  Card,
  Box,
  BlockStack,
  Banner,
} from "@shopify/polaris";

// Components
import { SettingsBlock } from "../components/SettingsBlock";
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

  const primaryAction = isConnected ? (
    <CreditsBadge balance={balance} />
  ) : undefined;

  const error = fetcher.data?.error;

  return (
    <Page title="Settings" primaryAction={primaryAction}>
      <BlockStack gap="400">
        {error && (
          <Banner tone="critical" title="Error">
            {error}
          </Banner>
        )}

        <Card>
          <Box padding="400">
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
          </Box>
        </Card>
      </BlockStack>
    </Page>
  );
}
