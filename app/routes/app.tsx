import { useEffect } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useNavigate, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import { syncShopBillingState } from "../lib/billing.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);

  try {
    await syncShopBillingState({
      shop: session.shop,
      billing,
    });
  } catch (error) {
    console.error("[Billing] Failed to sync plan state in app loader", {
      shop: session.shop,
      error,
    });
  }

  return null;
};

export default function App() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleNavigate = (event: Event) => {
      const target =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      const href = target?.getAttribute("href");

      if (href) {
        navigate(href);
      }
    };

    document.addEventListener("shopify:navigate", handleNavigate);

    return () => {
      document.removeEventListener("shopify:navigate", handleNavigate);
    };
  }, [navigate]);

  return (
    <AppProvider embedded={false}>
      <s-app-nav>
        <a href="/app" rel="home">Home</a>
        <a href="/app/marketing">Marketing Agent</a>
        <a href="/app/productgen">Catalogue Agent</a>
        <a href="/app/library">Library</a>
        <a href="/app/billing">Billing</a>
        <a href="/app/settings">FAQ & Settings</a>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
