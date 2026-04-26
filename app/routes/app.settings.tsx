import { useCallback } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { syncShopBillingState } from "../lib/billing.server";
import { encrypt, decrypt, maskApiKey } from "../lib/encryption.server";
import { syncShopifyStoreTokenToImai } from "../lib/imai-oauth.server";
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

const SUPPORT_EMAIL = "tech@imai.studio";

const FAQ_ITEMS = [
  {
    label:
      "Get your API key from IMAI.Studio under Profile > Extensions > Shopify.",
    question: "How do I connect my store?",
    answer: "Generate a key on IMAI.Studio and paste it here.",
  },
  {
    label:
      "Credits are pulled from your connected IMAI account and may need a short refresh window.",
    question: "Where do I get the API key?",
    answer: "Open IMAI.Studio > Profile > Extensions > Shopify.",
  },
  {
    label:
      "Removing the API key disconnects the app and clears saved IMAI job data for this shop.",
    question: "Do I get free credits?",
    answer: "Yes, you get 10 free credits to test the platform and plugin.",
  },
  {
    question: "Why should I connect my store?",
    answer: "It keeps Shopify and IMAI.Studio in sync.",
  },
  {
    question: "Where should I manage advanced features?",
    answer: "Most power features are managed on IMAI.Studio.",
  },
  {
    question: "Can I test before going all in?",
    answer: "Yes, use the free credits to learn the workflow first.",
  },
  {
    question: "Why are my credits different?",
    answer: "Credit totals sync from IMAI and may refresh with a delay.",
  },
  {
    question: "What happens if I remove the key?",
    answer: "The app disconnects and clears saved IMAI job data.",
  },
  {
    question: "Can I reconnect later?",
    answer: "Yes, add a new API key any time.",
  },
];

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
  const { session, billing } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  // API Key management actions
  if (intent === "saveKey") {
    const apiKey = (formData.get("apiKey") as string)?.trim();

    console.log("[Settings] Save key requested", {
      shop: session.shop,
      sessionId: session.id,
      hasAccessToken: !!session.accessToken,
      keyLength: apiKey?.length ?? 0,
    });

    if (!apiKey) {
      return { error: "API key is required" };
    }
    
    // Validate key with IMAI API
    try {
      console.log("[Settings] Validating IMAI health endpoint", {
        shop: session.shop,
      });
      const healthCheck = await fetch("https://www.imai.studio/api/v1/health");
      if (!healthCheck.ok) {
        console.warn("[Settings] IMAI health check failed", {
          shop: session.shop,
          status: healthCheck.status,
        });
        return { error: "Could not reach IMAI.Studio" };
      }

      console.log("[Settings] Validating IMAI credits endpoint", {
        shop: session.shop,
      });
      const creditsResp = await fetch("https://www.imai.studio/api/v1/credits", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (creditsResp.status === 401) {
        console.warn("[Settings] IMAI key rejected", {
          shop: session.shop,
          status: creditsResp.status,
        });
        return { error: "Invalid API key" };
      }

      if (creditsResp.status === 403) {
        console.warn("[Settings] IMAI key missing scopes", {
          shop: session.shop,
          status: creditsResp.status,
        });
        return { 
          error: "Key is missing required scopes: credits:read, library:read, generate:write" 
        };
      }

      if (!creditsResp.ok) {
        console.warn("[Settings] IMAI key validation failed", {
          shop: session.shop,
          status: creditsResp.status,
        });
        return { error: "Could not validate API key" };
      }

      const creditsData = await creditsResp.json();
      console.log("[Settings] IMAI key validated", {
        shop: session.shop,
        balance: creditsData.balance || 0,
      });
      
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

      console.log("[Settings] Stored IMAI key in database", {
        shop: session.shop,
        maskedKey,
      });

      const oauthSync = await syncShopifyStoreTokenToImai({
        shop: session.shop,
        imaiApiKey: apiKey,
        source: "settings-save",
        fallbackSession: {
          id: session.id,
          accessToken: session.accessToken,
          scope: session.scope,
          expires: session.expires,
          isOnline: session.isOnline,
        },
      });

      const warnings: string[] = [];
      if (!oauthSync.ok) {
        warnings.push(
          oauthSync.message ??
            "Saved the API key, but syncing the Shopify token to IMAI did not complete.",
        );
      }
      if (oauthSync.missingScopes.length) {
        warnings.push(
          `The current Shopify token is missing ${oauthSync.missingScopes.join(", ")}. Update app scopes, then reauthorize or reinstall the app before IMAI can sync and edit products.`,
        );
      }

      if (warnings.length) {
        console.warn("[Settings] Saved key with warnings", {
          shop: session.shop,
          warnings,
        });
      } else {
        console.log("[Settings] Saved key and synced Shopify token to IMAI", {
          shop: session.shop,
          oauthStatus: oauthSync.status ?? null,
          tokenId: oauthSync.tokenId ?? null,
        });
      }

      try {
        const billingSync = await syncShopBillingState({
          shop: session.shop,
          billing,
        });

        if (billingSync.creditAllocation.state === "failed") {
          warnings.push(billingSync.creditAllocation.message);
        }
      } catch (error) {
        console.error("[Settings] Billing sync after key save failed", {
          shop: session.shop,
          error,
        });
        warnings.push(
          "Saved the API key, but the current Shopify billing plan could not be synced to IMAI credits yet.",
        );
      }

      return {
        success: true,
        maskedKey,
        balance: creditsData.balance || 0,
        message: "IMAI API key connected successfully",
        warning: warnings.length ? warnings.join(" ") : null,
      };
    } catch (error) {
      console.error("[Settings] Save key failed", {
        shop: session.shop,
        error,
      });
      return { error: "Network error. Could not reach IMAI.Studio." };
    }
  }

  if (intent === "removeKey") {
    // Clean all IMAI data for this shop so adding a new key starts fresh
    await prisma.imaiJob.deleteMany({ where: { shop: session.shop } });
    await prisma.apiKey.deleteMany({ where: { shop: session.shop } });
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
  const warning = fetcher.data?.warning;
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
        {warning && (
          <Banner tone="warning" title="Needs Attention">
            {warning}
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
            <BlockStack gap="400">
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
                  <BlockStack gap="300">
                    <Text as="h2" variant="headingMd">
                      FAQ
                    </Text>
                    <Box paddingInlineStart="300">
                      <BlockStack as="ul" gap="200">
                        {FAQ_ITEMS.map((item) => (
                          <li key={item.question}>
                            <BlockStack gap="100">
                              <Text as="p" variant="bodyMd" fontWeight="medium">
                                {"• "}
                                {item.question}
                              </Text>
                              <Text as="p" variant="bodyMd" tone="subdued">
                                {item.answer}
                              </Text>
                              {item.label ? (
                                <Text as="p" variant="bodySm" tone="subdued">
                                  {item.label}
                                </Text>
                              ) : null}
                            </BlockStack>
                          </li>
                        ))}
                      </BlockStack>
                    </Box>
                  </BlockStack>
                </Box>
              </Card>
            </BlockStack>

            <BlockStack gap="400">
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

              <Card>
                <Box padding="400">
                  <BlockStack gap="200">
                    <Text as="h2" variant="headingMd">
                      Help
                    </Text>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      Need technical support with setup, credits, or API
                      connection issues?
                    </Text>
                    <Text as="p" variant="bodyMd">
                      Contact{" "}
                      <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
                    </Text>
                  </BlockStack>
                </Box>
              </Card>
            </BlockStack>
          </div>
        </Box>
      </BlockStack>
    </Page>
  );
}
