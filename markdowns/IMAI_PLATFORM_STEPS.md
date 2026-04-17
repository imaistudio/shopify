# IMAI Platform Steps

The Shopify app can now create monthly or annual subscriptions, but IMAI still needs a billing-sync endpoint to convert those subscriptions into credits.

## 1. Create the billing sync route

Create an authenticated IMAI route for:

- `POST /api/v1/shopify/allocate-credits`

Set the app env var:

- `IMAI_BILLING_SYNC_URL=https://www.imai.studio/api/v1/shopify/allocate-credits`

## 2. Authentication model

The Shopify app sends:

- `Authorization: Bearer <merchant-imai-api-key>`
- `Idempotency-Key: <grantKey>`
- `Content-Type: application/json`

The IMAI route should:

1. Validate the merchant API key.
2. Resolve the merchant org/account from that key.
3. Refuse duplicate grants for the same `grantKey`.

## 3. Request body the route should accept

The app posts this shape:

```json
{
  "provider": "shopify",
  "shop": "example.myshopify.com",
  "planSlug": "starter-annual",
  "planName": "IMAI Starter Annual",
  "planTier": "Starter",
  "billingInterval": "ANNUAL",
  "grantCredits": 20,
  "creditsPerMonth": 20,
  "billingAmount": 240,
  "currencyCode": "USD",
  "subscriptionId": "gid://shopify/AppSubscription/123",
  "subscriptionStatus": "ACTIVE",
  "subscriptionCreatedAt": "2026-04-01T00:00:00.000Z",
  "currentPeriodEnd": "2027-04-01T00:00:00.000Z",
  "grantWindowStart": "2026-04-01T00:00:00.000Z",
  "grantWindowEnd": "2026-05-01T00:00:00.000Z",
  "isTest": true,
  "grantKey": "example.myshopify.com:gid://shopify/AppSubscription/123:2026-04-01T00:00:00.000Z",
  "source": "shopify-app"
}
```

## 4. Granting rule

Use this rule:

- grant `grantCredits` once for each unique `grantKey`

That means:

- monthly subscriptions grant once per monthly window
- annual subscriptions also grant once per monthly window

So annual billing is yearly money collection, not yearly credit dumping.

## 5. Suggested persistence on IMAI

Store at least:

- `grantKey`
- `shop`
- `orgId` or `accountId`
- `planSlug`
- `planName`
- `billingInterval`
- `grantCredits`
- `subscriptionId`
- `grantWindowStart`
- `grantWindowEnd`
- `status`
- `response metadata`

Make `grantKey` unique.

## 6. Suggested response

On success:

```json
{
  "ok": true,
  "message": "Granted 20 credits for Starter annual monthly window",
  "grantKey": "example.myshopify.com:gid://shopify/AppSubscription/123:2026-04-01T00:00:00.000Z"
}
```

On duplicate:

```json
{
  "ok": true,
  "message": "Credits already granted for this billing window",
  "grantKey": "example.myshopify.com:gid://shopify/AppSubscription/123:2026-04-01T00:00:00.000Z"
}
```

## 7. Failure handling

If the IMAI route fails:

- return a non-2xx status
- include a useful `message`
- do not partially grant credits after writing the idempotency record unless the operation is atomic

The Shopify app stores failed sync attempts and retries later when the shop loads the app again.

## 8. Optional but useful additions

- Internal admin view for Shopify-originated credit grants
- Refund / reversal endpoint if you later decide to claw back unused credits
- Logging on `shop`, `subscriptionId`, and `grantKey`
- Alerting for repeated failed credit grants

## 9. Related env vars on the Shopify app

- `IMAI_BILLING_SYNC_URL`
- `SHOPIFY_BILLING_TEST_MODE`
- merchant API key already stored in the app database
