import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  DeliveryMethod,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";
import { decrypt } from "./lib/encryption.server";
import { syncShopifyStoreTokenToImai } from "./lib/imai-oauth.server";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  // Use non-expiring offline tokens so the Admin API token is long-lived and usable from anywhere
  // without refresh. See: https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/offline-access-tokens
  future: {
    expiringOfflineAccessTokens: false,
  },
  webhooks: {
    APP_UNINSTALLED: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks/app/uninstalled",
    },
    APP_SCOPES_UPDATE: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks/app/scopes_update",
    },
  },
  hooks: {
    afterAuth: async ({ session }) => {
      await shopify.registerWebhooks({ session });

      const storedKey = await prisma.apiKey.findUnique({
        where: { shop: session.shop },
      });

      if (!storedKey) {
        console.log("[Auth] No IMAI key stored yet, skipping Shopify token sync", {
          shop: session.shop,
        });
        return;
      }

      try {
        const result = await syncShopifyStoreTokenToImai({
          shop: session.shop,
          imaiApiKey: decrypt(storedKey.encryptedKey),
          source: "after-auth",
          fallbackSession: {
            id: session.id,
            accessToken: session.accessToken,
            scope: session.scope,
            expires: session.expires,
            isOnline: session.isOnline,
          },
        });

        if (!result.ok) {
          console.warn("[Auth] Shopify token sync to IMAI failed", {
            shop: session.shop,
            message: result.message ?? null,
            status: result.status ?? null,
          });
        }

        if (result.missingScopes.length) {
          console.warn("[Auth] Shopify token synced without required product scopes", {
            shop: session.shop,
            missingScopes: result.missingScopes,
          });
        }
      } catch (error) {
        console.error("[Auth] Unexpected error while syncing Shopify token to IMAI", {
          shop: session.shop,
          error,
        });
      }
    },
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.October25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
