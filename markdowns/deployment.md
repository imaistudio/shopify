# Deploying This Shopify App

Source-code verified on March 26, 2026.

This guide is specific to this repository. It documents what the app actually needs to run in production based on the current code, not on generic Shopify template defaults.

For a concrete AWS implementation of this deployment shape, see [`AWS_EC2_MIGRATION.md`](./AWS_EC2_MIGRATION.md).

## What this repo actually deploys

This project is an embedded Shopify app with:

- a long-lived Node server started by `react-router-serve`
- Prisma backed by SQLite
- Shopify webhooks for `app/uninstalled`, `app/scopes_update`, and compliance topics
- merchant-specific IMAI API keys stored in the app database
- asynchronous IMAI job callbacks handled at `/api/imai/webhook`
- in-memory server-sent events at `/api/imai/events` for live job updates

Those details matter for hosting:

- this is a better fit for a long-lived container host than for serverless
- SQLite means you should use a persistent disk
- in-memory SSE means you should run a single app instance unless you redesign that part

## Recommended production shape

For the current codebase, the simplest production setup is:

1. Host the app as a Docker web service.
2. Mount a persistent disk at `/var/data`.
3. Set `DATABASE_URL=file:/var/data/prod.sqlite`.
4. Run a single instance.
5. Point Shopify to the production HTTPS URL.
6. Run `shopify app deploy` to sync Shopify-side config after the hosted URL is ready.

This recommendation comes directly from the repo:

- [`Dockerfile`](./Dockerfile) builds and starts the app in a container.
- [`package.json`](./package.json) runs Prisma migrations during build and container startup.
- [`prisma/schema.prisma`](./prisma/schema.prisma) uses SQLite through `DATABASE_URL`.
- [`app/routes/api.imai.events.ts`](./app/routes/api.imai.events.ts) keeps live connections in memory.
- [`app/routes/api.health.ts`](./app/routes/api.health.ts) provides a health endpoint.

## What you need before deployment

You need:

- a Shopify Partner account
- a production Shopify app
- public distribution if you want an App Store listing
- at least one dev store for install testing
- a Docker-capable host with HTTPS
- a persistent writable disk on that host
- an IMAI API key you can use during testing and review

## Production environment variables

These are the variables the current app actually uses in production.

| Variable | Required | Why it matters |
| --- | --- | --- |
| `NODE_ENV` | yes | Set to `production`. [`app/lib/encryption.server.ts`](./app/lib/encryption.server.ts) enforces production key rules. |
| `DATABASE_URL` | yes | Prisma reads this in [`prisma/schema.prisma`](./prisma/schema.prisma). Use `file:/var/data/prod.sqlite` for the current SQLite deployment. |
| `SHOPIFY_APP_URL` | yes | Used by the Shopify app config and when building the IMAI webhook callback URL. |
| `SHOPIFY_API_KEY` | yes | Required by [`app/shopify.server.ts`](./app/shopify.server.ts). |
| `SHOPIFY_API_SECRET` | yes | Required by [`app/shopify.server.ts`](./app/shopify.server.ts). |
| `SCOPES` | yes | Read by [`app/shopify.server.ts`](./app/shopify.server.ts). Keep it aligned with `shopify.app.toml`. |
| `ENCRYPTION_KEY` | yes | Required in production for encrypting stored merchant IMAI keys. Must be at least 32 bytes. |
| `IMAI_WEBHOOK_SECRET` | recommended | If set, [`app/routes/api.imai.webhook.ts`](./app/routes/api.imai.webhook.ts) verifies IMAI webhook signatures. |
| `IMAI_BILLING_SYNC_URL` | recommended | Used by [`app/lib/billing.server.ts`](./app/lib/billing.server.ts) to grant monthly IMAI credits for both monthly and annual subscriptions. |
| `SHOPIFY_BILLING_TEST_MODE` | yes | Set this to `false` in production so recurring plans create real charges instead of test subscriptions. |
| `SHOP_CUSTOM_DOMAIN` | optional | Only needed if you use Shopify custom shop domains. |
| `PORT` | optional | Useful if your host injects a port. |

### Variables the current code does not use

Do not treat these as required deployment variables for this repo in its current state:

- `IMAI_API_KEY`
- `IMAI_BASE_URL`
- `R2_BASE_URL`
- `IMAGE_UPLOAD_CDN_URL`

Why:

- merchant IMAI API keys are stored per shop in the database, not read from a global env var
- IMAI endpoints are currently hardcoded to `https://www.imai.studio`
- reference-image uploads are stored in Shopify Files using Shopify staged uploads

## External services the app must reach

Your production app needs outbound network access to:

- `https://www.imai.studio`
- Shopify Admin GraphQL and Shopify staged upload targets

Current code paths:

- IMAI generation, credits, OAuth, and library requests call `https://www.imai.studio`
- image upload flows call Shopify staged uploads and create merchant-approved files in Shopify Files

If those hosts are blocked, the app will appear broken even if Shopify auth works perfectly.

## Database behavior in production

The Prisma datasource is:

```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}
```

For the current deployment shape:

- mount a persistent disk at `/var/data`
- set `DATABASE_URL=file:/var/data/prod.sqlite`
- run one app instance

What gets stored:

- Shopify sessions in `Session`
- encrypted merchant IMAI keys in `ApiKey`
- Shopify billing state in `ShopBillingState`
- Shopify-to-IMAI credit grant history in `BillingCreditAllocation`
- async generation jobs in `ImaiJob`

With this setup:

- data survives container restarts if the disk is persistent
- you do not get a normal remote SQL endpoint
- horizontal scaling is a bad idea until you move off SQLite and redesign the SSE layer

## Build and startup behavior

The current scripts are:

```json
{
  "build": "prisma generate && prisma migrate deploy && react-router build",
  "setup": "prisma generate && prisma migrate deploy",
  "docker-start": "npm run setup && npm run start",
  "start": "react-router-serve ./build/server/index.js"
}
```

Important detail:

- `npm run build` requires `DATABASE_URL` to exist because it runs `prisma migrate deploy`

The current [`Dockerfile`](./Dockerfile) already sets:

```dockerfile
ENV NODE_ENV=production
ENV DATABASE_URL=file:/var/data/prod.sqlite
```

and starts the app with:

```dockerfile
CMD ["npm", "run", "docker-start"]
```

That means the container expects `/var/data` to exist and stay writable.

## Shopify configuration you must keep aligned

Before running `shopify app deploy`, make sure [`shopify.app.toml`](./shopify.app.toml) matches production:

- `application_url` must be your production HTTPS URL
- `auth.redirect_urls` must contain your production callback URL
- scopes must match the `SCOPES` environment variable

This repo already declares:

- `app/uninstalled`
- `app/scopes_update`
- `app_subscriptions/update`
- compliance topics routed to `/webhooks/compliance`

Current webhook config lives in [`shopify.app.toml`](./shopify.app.toml), and webhook handlers live in:

- [`app/routes/webhooks.app.uninstalled.tsx`](./app/routes/webhooks.app.uninstalled.tsx)
- [`app/routes/webhooks.app.scopes_update.tsx`](./app/routes/webhooks.app.scopes_update.tsx)
- [`app/routes/webhooks.app.subscriptions.update.tsx`](./app/routes/webhooks.app.subscriptions.update.tsx)
- [`app/routes/webhooks.compliance.tsx`](./app/routes/webhooks.compliance.tsx)

`shopify app deploy` syncs Shopify-side configuration only. It does not deploy your container.

## Step-by-step deployment

### 1. Create or choose the production Shopify app

If you want merchants outside your own stores to install it, use public distribution for the production app.

### 2. Update Shopify URLs for production

Change [`shopify.app.toml`](./shopify.app.toml) from the local ngrok URL to your production URL:

```toml
application_url = "https://imai.up.railway.app"

[auth]
redirect_urls = ["https://imai.up.railway.app/auth/callback"]
```

### 3. Create the host service

Use a host that supports:

- Docker image builds
- inbound HTTPS
- a persistent writable disk
- a single long-lived process

Recommended host settings:

- internal port: `3000`
- disk mount path: `/var/data`
- health check path: `/api/health`
- instance count: `1`

### 3A. Railway settings

If you deploy this repo on Railway, configure it like this:

1. Create a web service from the repo and let Railway build the included `Dockerfile`.
2. Add a volume and mount it at `/var/data`.
3. Run only one replica for this service.
4. Set the service domain or custom domain first, then set `SHOPIFY_APP_URL` to that exact HTTPS URL.
5. Set `DATABASE_URL=file:/var/data/prod.sqlite`.
6. Use `/api/health` as the health check path if you configure health checks manually.

Railway is a good fit for the current repo because it supports Docker plus persistent volumes. The app is still single-instance by design because of SQLite and in-memory SSE.

### 4. Set environment variables

At minimum, set:

```bash
NODE_ENV=production
DATABASE_URL=file:/var/data/prod.sqlite
SHOPIFY_APP_URL=https://ecommerce.imai.studio
SHOPIFY_API_KEY=...
SHOPIFY_API_SECRET=...
SCOPES=read_products,write_products,write_files
ENCRYPTION_KEY=use-a-random-secret-at-least-32-bytes-long
```

Also set this if you want IMAI webhook verification enabled:

```bash
IMAI_WEBHOOK_SECRET=...
```

### 5. Deploy the container

The current Docker flow:

- installs dependencies
- runs `npm run build`
- starts with `npm run docker-start`

That applies Prisma migrations during both build and startup.

### 6. Sync Shopify-side configuration

After the hosted URL is live, run:

```bash
shopify app deploy
```

Use this step whenever you change:

- app URL
- redirect URLs
- scopes
- webhook configuration

### 7. Verify the deployed app

Check all of these:

- `https://imai.up.railway.app/api/health` returns `{"ok":true}`
- the container logs show Prisma migrations completed
- the app installs into a dev store
- embedded auth completes and lands inside Shopify Admin
- saving an IMAI key in Settings works and still appears after reload
- generation jobs create database rows and finish through the webhook flow

## Required functional test pass before release

Do not stop after the app loads once.

### Install and auth

Verify:

1. install from the production app configuration into a dev store
2. open the app embedded in Shopify Admin
3. refresh the app and confirm the session persists
4. confirm there are no redirect loops

### Settings and persistence

Verify:

1. save a real IMAI API key in Settings
2. reload the app
3. confirm the masked key is still shown
4. confirm credits can still be fetched

This validates encryption, DB writes, and session persistence.

### Generation and webhook flow

Verify:

1. design generation
2. marketing generation
3. ecommerce generation
4. library loading
5. history loading

For async jobs, confirm:

1. an `ImaiJob` row is created
2. IMAI calls `/api/imai/webhook`
3. the job row updates
4. the UI receives the state change through `/api/imai/events`
5. repeated deliveries do not corrupt the record

### Uninstall and privacy flow

Verify:

1. uninstall the app
2. confirm `app/uninstalled` is received
3. reinstall the app
4. confirm the app still authenticates correctly
5. confirm compliance webhooks are subscribed after `shopify app deploy`

## Reviewer notes for a public App Store submission

For this repo, reviewer instructions should include:

- how to install the app into the provided test store
- a working IMAI API key the reviewer can save in Settings
- the exact steps to trigger at least one generation flow
- any wait time expected for async job completion

If the reviewer cannot connect an IMAI key, most of the app's real functionality is unavailable. Make that dependency explicit in the submission notes.

## Known deployment-sensitive caveats in the current repo

- `npm run build` fails if `DATABASE_URL` is missing.
- The app is currently designed for one instance because of SQLite plus in-memory SSE.
- IMAI endpoints are hardcoded to `https://www.imai.studio`; changing that requires code changes, not env changes.
- Reference-image upload flows depend on Shopify staged uploads and the `write_files` scope.

## Useful references

- [Shopify distribution methods](https://shopify.dev/docs/apps/launch/distribution)
- [Shopify deploy to a hosting service](https://shopify.dev/docs/apps/launch/deployment/deploy-to-hosting-service)
- [Shopify app review guidance](https://shopify.dev/docs/apps/launch/app-store-review/pass-app-review)
- [Shopify privacy law compliance](https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance)
