import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
} from "react-router";
import { AppProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import "@shopify/polaris/build/esm/styles.css";

const embeddedNavStyles = `
  s-app-nav,
  ui-nav-menu {
    --p-color-icon: #000;
    --p-color-icon-secondary: #000;
    --p-color-icon-brand: #000;
    --p-color-text: #000;
    --p-color-text-secondary: #000;
    --p-color-text-brand: #000;
    color: #000;
  }
`;

export const loader = () => {
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        {apiKey ? <meta name="shopify-api-key" content={apiKey} /> : null}
        <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <style>{embeddedNavStyles}</style>
        <Meta />
        <Links />
      </head>
      <body>
        <AppProvider i18n={enTranslations}>
          <Outlet />
        </AppProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
