# Shopify Reviewer Notes for IMAI.Studio

Last updated: April 18, 2026

## Reviewer account and setup

- Use the provided Shopify development store.
- Install the app from the review listing or install link.
- Open the app inside Shopify Admin.

## Important dependency

The app requires a valid IMAI.Studio API key to access its core functionality.

Without an IMAI.Studio API key, billing pages load, but generation, credits, library access, and sync workflows are intentionally limited.

## Reviewer test credentials

Provide these separately in the Shopify submission form:

- test store URL
- test IMAI.Studio API key
- any test product URL you want the reviewer to use for ecommerce generation

## Recommended review path

1. Install the app and complete OAuth.
2. Open the app inside Shopify Admin.
3. Go to `FAQ & Settings`.
4. Paste the provided IMAI.Studio API key and save it.
5. Confirm the app shows a successful connection state.
6. Visit `Marketing Agent` and run one generation.
7. Visit `Catalogue Agent` and run one generation.
8. Visit `Library` and confirm assets load.
9. Visit `Billing` and confirm plans are visible.
10. Approve a test subscription on the provided dev store if needed.

## Async behavior

Some generation requests are asynchronous. A request can take a short time to complete because the app waits for webhook-driven job updates from IMAI.Studio.

## Billing behavior

- The app uses Shopify Billing API based subscription billing.
- Monthly and annual plans are defined in app code.
- Annual billing charges upfront, while credits are granted in monthly windows.

## Data handling summary

- The app stores shop-scoped session and billing state.
- The merchant's IMAI.Studio API key is stored encrypted.
- The app stores generation job metadata.
- The app does not intentionally maintain independent customer or order databases.

