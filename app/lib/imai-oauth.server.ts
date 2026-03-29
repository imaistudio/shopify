import prisma from "../db.server";

const IMAI_OAUTH_URL = "https://www.imai.studio/api/v1/oauth";

export const REQUIRED_SHOPIFY_PRODUCT_SCOPES = [
  "read_products",
  "write_products",
] as const;

type RequiredShopifyProductScope =
  (typeof REQUIRED_SHOPIFY_PRODUCT_SCOPES)[number];

type SessionLike = {
  id: string;
  accessToken?: string | null;
  scope?: string | null;
  expires?: Date | null;
  isOnline?: boolean;
};

type SyncShopifyStoreTokenParams = {
  shop: string;
  imaiApiKey: string;
  source: string;
  fallbackSession?: SessionLike;
};

type SyncShopifyStoreTokenResult = {
  ok: boolean;
  status?: number;
  tokenId?: string;
  message?: string;
  missingScopes: RequiredShopifyProductScope[];
  sessionId?: string;
  sessionType?: "online" | "offline";
};

function parseScopes(scope?: string | null): string[] {
  return (scope ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function maskSecret(secret?: string | null): string {
  if (!secret) return "(missing)";
  if (secret.length <= 8) return `${secret.slice(0, 2)}••••`;
  return `${secret.slice(0, 6)}••••${secret.slice(-4)}`;
}

function getMissingProductScopes(
  grantedScopes: string[],
): RequiredShopifyProductScope[] {
  return REQUIRED_SHOPIFY_PRODUCT_SCOPES.filter(
    (requiredScope) => !grantedScopes.includes(requiredScope),
  );
}

async function resolveShopifyStoreSession(
  shop: string,
  fallbackSession?: SessionLike,
): Promise<SessionLike | null> {
  const storedSessions = await prisma.session.findMany({
    where: { shop },
  });

  const preferredSession =
    storedSessions.find((session) => !session.isOnline && session.accessToken) ??
    storedSessions.find((session) => session.accessToken) ??
    (fallbackSession?.accessToken ? fallbackSession : null);

  if (!preferredSession?.accessToken) {
    return null;
  }

  return {
    id: preferredSession.id,
    accessToken: preferredSession.accessToken,
    scope: preferredSession.scope ?? null,
    expires: preferredSession.expires ?? null,
    isOnline: preferredSession.isOnline ?? false,
  };
}

export async function syncShopifyStoreTokenToImai({
  shop,
  imaiApiKey,
  source,
  fallbackSession,
}: SyncShopifyStoreTokenParams): Promise<SyncShopifyStoreTokenResult> {
  console.log(`[IMAI OAuth] [${source}] Starting Shopify token sync`, {
    shop,
  });

  try {
    const session = await resolveShopifyStoreSession(shop, fallbackSession);

    if (!session?.accessToken) {
      console.warn(`[IMAI OAuth] [${source}] No Shopify session available`, {
        shop,
      });
      return {
        ok: false,
        message:
          "Saved the IMAI API key, but no Shopify access token was available to sync to IMAI yet.",
        missingScopes: [...REQUIRED_SHOPIFY_PRODUCT_SCOPES],
      };
    }

    const grantedScopes = parseScopes(session.scope);
    const missingScopes = getMissingProductScopes(grantedScopes);

    console.log(`[IMAI OAuth] [${source}] Resolved Shopify session`, {
      shop,
      sessionId: session.id,
      sessionType: session.isOnline ? "online" : "offline",
      token: maskSecret(session.accessToken),
      scopes: grantedScopes,
      missingScopes,
      tokenExpiresAt: session.expires?.toISOString() ?? null,
    });

    const response = await fetch(IMAI_OAUTH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${imaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        platform: "shopify",
        platformUserId: shop,
        token: session.accessToken,
        tokenExpiresAt: session.expires?.getTime(),
        scope: grantedScopes.length ? grantedScopes : undefined,
        metadata: {
          shop,
          sessionId: session.id,
          sessionType: session.isOnline ? "online" : "offline",
        },
        domain: shop,
      }),
    });

    const responseText = await response.text();
    let parsedResponse: Record<string, unknown> | null = null;

    try {
      parsedResponse = responseText ? JSON.parse(responseText) : null;
    } catch {
      parsedResponse = null;
    }

    if (!response.ok) {
      console.error(`[IMAI OAuth] [${source}] Sync failed`, {
        shop,
        status: response.status,
        response:
          parsedResponse ??
          responseText.slice(0, 400) ??
          "No response body returned",
      });

      return {
        ok: false,
        status: response.status,
        message:
          typeof parsedResponse?.message === "string"
            ? parsedResponse.message
            : typeof parsedResponse?.error === "string"
              ? parsedResponse.error
              : `IMAI rejected the Shopify token sync request with status ${response.status}.`,
        missingScopes,
        sessionId: session.id,
        sessionType: session.isOnline ? "online" : "offline",
      };
    }

    console.log(`[IMAI OAuth] [${source}] Sync succeeded`, {
      shop,
      status: response.status,
      tokenId:
        typeof parsedResponse?.tokenId === "string"
          ? parsedResponse.tokenId
          : null,
      message:
        typeof parsedResponse?.message === "string"
          ? parsedResponse.message
          : null,
      missingScopes,
    });

    return {
      ok: true,
      status: response.status,
      tokenId:
        typeof parsedResponse?.tokenId === "string"
          ? parsedResponse.tokenId
          : undefined,
      message:
        typeof parsedResponse?.message === "string"
          ? parsedResponse.message
          : undefined,
      missingScopes,
      sessionId: session.id,
      sessionType: session.isOnline ? "online" : "offline",
    };
  } catch (error) {
    console.error(`[IMAI OAuth] [${source}] Unexpected sync error`, {
      shop,
      error,
    });

    return {
      ok: false,
      message:
        "Saved the IMAI API key, but syncing the Shopify token to IMAI failed with a network or server error.",
      missingScopes: [...REQUIRED_SHOPIFY_PRODUCT_SCOPES],
    };
  }
}
