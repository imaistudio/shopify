# Shopify Dashboard Steps

This app uses **manual billing with Shopify's Billing API**. That means recurring plans are defined in code, not in Shopify-managed pricing.

## 1. Partner Dashboard checks

1. Open the app in the Shopify Partner Dashboard.
2. Confirm the app uses **public distribution**.
3. Do not switch this billing flow to Shopify-managed pricing unless you also rewrite the app billing code.
4. Confirm the production app URL and redirect URL match the deployed app.

## 2. App listing pricing content

Update the pricing copy in the listing so it matches the app exactly:

### Free

- `$0`
- 10 free credits

### Monthly

- `Starter` at `$20/month`
- `Pro` at `$100/month`
- `Ultra` at `$200/month`

### Annual

- `Starter` at `$240/year`
- `Pro` at `$1,200/year`
- `Ultra` at `$2,400/year`

Notes:

- Do not mention a yearly discount.
- Make it explicit that annual billing still grants credits monthly.
- Make it explicit that paid plans grant IMAI credits.

## 3. App config sync

After changing app config or webhooks:

1. Deploy the app code.
2. Run `shopify app deploy`.
3. Reinstall or reopen the app on the target store if needed.

## 4. Webhooks to verify

This app should have these app-specific subscriptions active:

- `app/uninstalled`
- `app/scopes_update`
- `app/subscriptions/update`
- compliance topics

The annual and monthly recurring plans both depend on `app/subscriptions/update` being delivered.

## 5. Billing behavior to validate in Shopify

1. Install the app on a development store.
2. Keep `SHOPIFY_BILLING_TEST_MODE=true` locally.
3. Open the in-app Billing page.
4. Subscribe to a monthly plan and verify the redirect returns to `/app/billing`.
5. Subscribe to an annual plan and verify the redirect returns to `/app/billing`.
6. Change from one paid plan to another and confirm the active plan updates.
7. Cancel the active subscription from the app and confirm the plan falls back to free.

## 6. Charges and earnings checks

Use Partner Dashboard reporting to confirm charges are being created:

- App charge overview
- Store charge detail
- Payouts
- App history

## 7. Production env vars that matter on the Shopify side

- `SHOPIFY_API_KEY`
- `SHOPIFY_API_SECRET`
- `SHOPIFY_APP_URL`
- `SCOPES`
- `SHOPIFY_BILLING_TEST_MODE=false`

## 8. Important constraint

Because this implementation uses the Billing API:

- the app must stay public if you want to charge merchants through Shopify
- the plan definitions in code are the source of truth for actual charges
- the Partner Dashboard pricing copy must match the code, because mismatched pricing is how you earn avoidable review comments
