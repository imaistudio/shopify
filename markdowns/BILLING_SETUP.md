# Billing Setup Overview

The app now supports these Shopify Billing API plans:

## Monthly

- `Starter` at `$20/month`
- `Pro` at `$100/month`
- `Ultra` at `$200/month`

## Annual

- `Starter` at `$240/year`
- `Pro` at `$1,200/year`
- `Ultra` at `$2,400/year`

There is no annual discount. Annual plans are billed yearly, but credits are still granted in monthly windows.

## Docs

- Shopify / Partner Dashboard tasks: [SHOPIFY_DASHBOARD_STEPS.md](./SHOPIFY_DASHBOARD_STEPS.md)
- IMAI platform tasks: [IMAI_PLATFORM_STEPS.md](./IMAI_PLATFORM_STEPS.md)

## Current implementation notes

- Billing is manual and code-driven through Shopify's Billing API, not Shopify-managed pricing.
- Free is the absence of an active paid subscription.
- Paid plans sync into IMAI through `IMAI_BILLING_SYNC_URL`.
- Credit grants are idempotent and tracked in Prisma.

## Official docs used

- https://shopify.dev/docs/apps/launch/billing
- https://shopify.dev/docs/api/shopify-app-react-router/latest/apis/billing
- https://shopify.dev/docs/api/admin-graphql/latest/mutations/appSubscriptionCreate
- https://shopify.dev/docs/apps/launch/distribution
- https://shopify.dev/docs/apps/launch/billing/view-charges-earnings
