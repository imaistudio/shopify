# IMAI API Spec: `POST /api/v1/shopify/allocate-credits`

This document is the implementation contract for the IMAI platform route that receives Shopify-paid plan events and grants credits to the correct IMAI account.

The Shopify app will call this route after it verifies the merchant has an active Shopify subscription.

## Goal

When a merchant has an active Shopify subscription:

1. The Shopify app calls this IMAI route.
2. IMAI validates the merchant API key.
3. IMAI checks whether this billing window was already processed.
4. If not processed, IMAI grants credits.
5. IMAI stores the idempotency key so retries don't double-credit the merchant.

## Endpoint

`POST /api/v1/shopify/allocate-credits`

## Auth

Use the merchant's IMAI API key:

```http
Authorization: Bearer <merchant_imai_api_key>
Content-Type: application/json
Idempotency-Key: <grantKey>
```

The route must reject missing or invalid API keys.

## Core Rule

`grantKey` is the source of truth for idempotency.

If the same `grantKey` comes in twice:

- do not grant credits twice
- return success with a message like "already granted"

## Request Body

```json
{
  "provider": "shopify",
  "shop": "example-store.myshopify.com",
  "planSlug": "starter-annual",
  "planName": "IMAI Starter Annual",
  "planTier": "Starter",
  "billingInterval": "ANNUAL",
  "grantCredits": 20,
  "creditsPerMonth": 20,
  "billingAmount": 240,
  "currencyCode": "USD",
  "subscriptionId": "gid://shopify/AppSubscription/123456789",
  "subscriptionStatus": "ACTIVE",
  "subscriptionCreatedAt": "2026-04-02T10:00:00.000Z",
  "currentPeriodEnd": "2027-04-02T10:00:00.000Z",
  "grantWindowStart": "2026-04-02T10:00:00.000Z",
  "grantWindowEnd": "2026-05-02T10:00:00.000Z",
  "isTest": false,
  "grantKey": "example-store.myshopify.com:gid://shopify/AppSubscription/123456789:2026-04-02T10:00:00.000Z",
  "source": "shopify-app"
}
```

## Required Fields

- `provider`
- `shop`
- `planSlug`
- `planName`
- `billingInterval`
- `grantCredits`
- `currencyCode`
- `subscriptionId`
- `subscriptionStatus`
- `grantWindowStart`
- `grantWindowEnd`
- `grantKey`

## Field Meaning

- `shop`: Shopify shop domain
- `planSlug`: internal plan id from the Shopify app
- `planName`: human-readable plan name
- `billingInterval`: `MONTHLY` or `ANNUAL`
- `grantCredits`: credits to add in this single grant
- `subscriptionId`: Shopify subscription id
- `grantWindowStart` / `grantWindowEnd`: the specific monthly credit window being granted
- `grantKey`: unique key for this exact grant

## Expected Behavior

### If request is valid and not processed before

1. Resolve merchant/org using the bearer API key.
2. Confirm the API key is allowed to receive credits.
3. Check storage for `grantKey`.
4. If not found:
   - add `grantCredits` to the merchant/org
   - create a credit grant record
   - store `grantKey` as used
5. Return success.

### If request is valid but already processed

1. Find existing record by `grantKey`
2. Do not add credits again
3. Return success with `alreadyGranted: true`

### If request is invalid

Return a proper 4xx error and do not write credits.

## Success Response

### First-time grant

```json
{
  "ok": true,
  "alreadyGranted": false,
  "message": "Granted 20 credits",
  "grant": {
    "grantKey": "example-store.myshopify.com:gid://shopify/AppSubscription/123456789:2026-04-02T10:00:00.000Z",
    "shop": "example-store.myshopify.com",
    "planSlug": "starter-annual",
    "planName": "IMAI Starter Annual",
    "billingInterval": "ANNUAL",
    "creditsGranted": 20,
    "subscriptionId": "gid://shopify/AppSubscription/123456789",
    "grantWindowStart": "2026-04-02T10:00:00.000Z",
    "grantWindowEnd": "2026-05-02T10:00:00.000Z",
    "creditedToOrgId": "org_123",
    "creditedToApiKeyId": "key_123",
    "createdAt": "2026-04-02T10:00:02.000Z"
  }
}
```

### Duplicate but safe retry

```json
{
  "ok": true,
  "alreadyGranted": true,
  "message": "Credits already granted for this billing window",
  "grant": {
    "grantKey": "example-store.myshopify.com:gid://shopify/AppSubscription/123456789:2026-04-02T10:00:00.000Z",
    "shop": "example-store.myshopify.com",
    "planSlug": "starter-annual",
    "planName": "IMAI Starter Annual",
    "billingInterval": "ANNUAL",
    "creditsGranted": 20,
    "subscriptionId": "gid://shopify/AppSubscription/123456789",
    "grantWindowStart": "2026-04-02T10:00:00.000Z",
    "grantWindowEnd": "2026-05-02T10:00:00.000Z",
    "creditedToOrgId": "org_123",
    "creditedToApiKeyId": "key_123",
    "createdAt": "2026-04-02T10:00:02.000Z"
  }
}
```

## Error Responses

### Invalid API key

```json
{
  "ok": false,
  "error": "INVALID_API_KEY",
  "message": "The provided API key is invalid or expired"
}
```

Status: `401`

### Missing required fields

```json
{
  "ok": false,
  "error": "VALIDATION_ERROR",
  "message": "grantKey, subscriptionId, grantWindowStart, and grantCredits are required"
}
```

Status: `400`

### Subscription not active

```json
{
  "ok": false,
  "error": "SUBSCRIPTION_NOT_ACTIVE",
  "message": "Credits can only be granted for ACTIVE subscriptions"
}
```

Status: `409`

### Internal failure

```json
{
  "ok": false,
  "error": "CREDIT_GRANT_FAILED",
  "message": "Could not grant credits at this time"
}
```

Status: `500`

## Validation Rules

Reject the request if:

- `provider !== "shopify"`
- `subscriptionStatus !== "ACTIVE"`
- `grantCredits <= 0`
- `currencyCode !== "USD"` unless you explicitly support more currencies
- `grantWindowStart` is invalid
- `grantWindowEnd` is invalid
- `grantWindowEnd <= grantWindowStart`
- `grantKey` is missing
- `subscriptionId` is missing

## Storage You Should Have

Create a persistent record for each grant.

Suggested fields:

- `id`
- `grantKey` unique
- `shop`
- `orgId`
- `apiKeyId`
- `planSlug`
- `planName`
- `planTier`
- `billingInterval`
- `grantCredits`
- `creditsPerMonth`
- `billingAmount`
- `currencyCode`
- `subscriptionId`
- `subscriptionStatus`
- `subscriptionCreatedAt`
- `currentPeriodEnd`
- `grantWindowStart`
- `grantWindowEnd`
- `isTest`
- `source`
- `createdAt`

Make `grantKey` unique.

## Very Important Things To Look Out For

### 1. Idempotency

This is the biggest one.

If the same request retries:

- do not grant credits twice

Use:

- `Idempotency-Key` header
- `grantKey` in body
- unique DB constraint on `grantKey`

### 2. Atomic write

The credit increase and the grant record should be in one transaction.

Bad:

- add credits
- crash
- never save `grantKey`

Then retry gives credits again.

### 3. Annual plans should still grant monthly

Do not add 12 months of credits at once unless you intentionally want that behavior.

This app expects:

- annual payment
- monthly credit grants

### 4. API key mapping

The bearer key decides **who gets credited**.

Do not trust `shop` alone as the account mapping.

Best approach:

- resolve org/account from API key
- optionally verify the `shop` belongs to that org if you store that linkage

### 5. Test mode

If `isTest=true`:

- either grant test credits into a safe test org mode
- or allow it but flag it in logs

At minimum, store the flag.

### 6. Replay safety

If two requests with the same `grantKey` hit at the same time:

- one should win
- the other should return "already granted"

This is why the DB unique constraint matters.

## Suggested Pseudocode

```ts
POST /api/v1/shopify/allocate-credits

1. Read Authorization bearer token
2. Validate API key
3. Parse JSON body
4. Validate required fields
5. Ensure provider === "shopify"
6. Ensure subscriptionStatus === "ACTIVE"
7. Begin DB transaction
8. Check if grantKey already exists
9. If exists:
   return success alreadyGranted=true
10. Add grantCredits to org/account balance
11. Insert credit grant row with grantKey
12. Commit transaction
13. Return success alreadyGranted=false
```

## Logging

Log these fields:

- `shop`
- `grantKey`
- `subscriptionId`
- `planSlug`
- `grantCredits`
- `billingInterval`
- `isTest`
- `orgId`

Do not log full raw API keys.

## What The Shopify App Will Expect

The Shopify app only needs:

- `2xx` on success
- clear JSON `message`
- duplicate-safe behavior

If this route returns `4xx/5xx`, the Shopify app will record the sync as failed and retry later.

## Recommended Final Decision

Build this route as:

- authenticated
- idempotent
- transactional
- monthly-grant based

That is the boring correct version, which is exactly what you want for billing.
