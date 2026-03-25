# Deploying IMAI Studio and publishing it as a public Shopify app

Last verified against Shopify docs on March 16, 2026.

This guide is specific to this repository. It covers:

- how to host the app
- how the database works in production
- how to test the full install-to-webhook flow
- what Shopify currently requires before a public App Store submission

## What "any user can download and use it" means on Shopify

If you want merchants outside your own clients to install this app, this must be a **public app** with **public distribution**.

- **Custom distribution** is for specific merchants only. It is not the path for a general App Store release.
- **Public distribution** is the path that lets you submit the app for Shopify review and publish an App Store listing.
- Shopify says the app's distribution method can't be changed later, so use the correct production app before you invest more setup time.

Useful Shopify docs:

- [Distribution methods](https://shopify.dev/docs/apps/launch/distribution)
- [Create an App Store listing](https://shopify.dev/docs/apps/launch/app-store-review/app-listing)
- [Submit your app for review](https://shopify.dev/docs/apps/launch/app-store-review/submit-app-for-review)

## Recommended production architecture for this repo

The lowest-friction production setup for this codebase today is:

1. Host the app as a **Docker web service** on Render or another long-lived container host.
2. Use a **persistent disk** and keep Prisma on **SQLite** for the first release.
3. Point Shopify at the production HTTPS URL.
4. Run `shopify app deploy` to sync Shopify-side config, scopes, and webhooks.
5. Submit the app from the Shopify Partner Dashboard.

Why this is the best fit for the current repo:

- The app already has a production [`Dockerfile`](./Dockerfile).
- The server runs as a long-lived Node process using `react-router-serve`.
- The app uses in-memory server-sent events in [`app/routes/api.imai.events.ts`](./app/routes/api.imai.events.ts), which is a poor fit for serverless hosting.
- Prisma is already wired up for a file-backed SQLite database in [`prisma/schema.prisma`](./prisma/schema.prisma).
- The production build already runs `prisma migrate deploy` through `npm run build` and `npm run setup`.

If you expect high volume, multiple app instances, or want remote SQL access, SQLite will stop being convenient. For the first hosted version it is fine; for scale, plan a move to managed Postgres before you add multiple replicas.

## Current Shopify items to take care of before submission

These are the Shopify-specific items that matter for this repo right now:

- Use a **public production URL** with valid HTTPS.
- Keep the app **embedded** inside Shopify Admin.
- Keep using Shopify's embedded auth flow and session-token approach through the official React Router package already in this repo.
- Register the mandatory **privacy compliance webhooks**.
- Provide reviewer instructions, test credentials, and a working test store in the submission form.
- Add the app listing details Shopify asks for, such as app name, icon, support contact, and privacy-related information.

Important current review note: Shopify's docs say to configure compliance webhooks using `compliance_topics`. This repo's `shopify.app.toml` has been updated accordingly.

References:

- [Pass app review](https://shopify.dev/docs/apps/launch/app-store-review/pass-app-review)
- [Privacy law compliance](https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance)
- [Embedded apps](https://shopify.dev/docs/apps/build/authentication-authorization/session-tokens)

## Before you deploy

You need all of the following:

- a Shopify Partner account
- a Shopify app created for production
- the app set up for **public distribution**
- at least one dev store for testing installs
- a Render account or another Docker-capable host
- a GitHub or GitLab repo connected to that host
- working IMAI credentials for reviewer testing

## How the production database works

This repo currently uses Prisma with SQLite:

```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}
```

That means the app connects to its production database entirely through `DATABASE_URL`.

### The simple hosted setup

For this repo, the easiest production database setup is:

- attach a persistent disk to the web service
- mount it at `/var/data`
- set:

```bash
DATABASE_URL=file:/var/data/prod.sqlite
```

That is all the app needs. Prisma reads `DATABASE_URL`, and the startup scripts run migrations automatically.

### What gets stored there

The current Prisma models show that the database stores:

- Shopify sessions in `Session`
- encrypted merchant IMAI keys in `ApiKey`
- generation jobs in `ImaiJob`

See [`prisma/schema.prisma`](./prisma/schema.prisma).

### Important limitation

With SQLite on a mounted disk:

- the app can persist data across deploys
- the app does **not** connect to a separate database server
- you should run only one primary app instance
- remote SQL access is awkward compared with Postgres

If you later want easier backups, remote query access, or horizontal scaling, migrate to a managed Postgres database and update the Prisma datasource before scaling the app further.

## Production environment variables

Set these on the host:

| Variable | Required | Notes |
| --- | --- | --- |
| `NODE_ENV` | yes | set to `production` |
| `DATABASE_URL` | yes | use `file:/var/data/prod.sqlite` for the current SQLite setup |
| `SHOPIFY_APP_URL` | yes | exact public HTTPS URL of the hosted app |
| `SHOPIFY_API_KEY` | yes | from the Shopify app environment |
| `SHOPIFY_API_SECRET` | yes | from the Shopify app environment |
| `SCOPES` | yes | keep in sync with `shopify.app.toml` |
| `ENCRYPTION_KEY` | yes | must be at least 32 bytes; production boot fails without it |
| `IMAI_WEBHOOK_SECRET` | recommended | if set, the app enforces HMAC verification on IMAI callbacks |
| `IMAI_BASE_URL` | recommended | set to the live IMAI API base if you use it in production |
| `R2_BASE_URL` | optional | only if your deployment uses it |
| `IMAGE_UPLOAD_CDN_URL` | optional | only if your deployment uses it |

Notes:

- `SHOPIFY_APP_URL` is used when building the callback URL for [`app/routes/api.imai.webhook.ts`](./app/routes/api.imai.webhook.ts).
- `ENCRYPTION_KEY` is enforced in production by [`app/lib/encryption.server.ts`](./app/lib/encryption.server.ts).
- `SHOPIFY_API_KEY` and `SHOPIFY_API_SECRET` can be checked with `shopify app env show`.

## Step-by-step deployment

### 1. Prepare Shopify config

Shopify recommends keeping a separate app config for development and production so local tunnel changes do not leak into the live app. If you keep a single `shopify.app.toml`, be disciplined about changing it back before local work.

Update [`shopify.app.toml`](./shopify.app.toml) so it points to the production URL:

```toml
application_url = "https://your-app.onrender.com"

[auth]
redirect_urls = ["https://your-app.onrender.com/auth/callback"]
```

This repo already defines:

- `app/uninstalled`
- `app/scopes_update`
- the required privacy compliance webhooks at `/webhooks/compliance`

Keep `webhooks.api_version` on a current stable version. This repo now uses `2026-01`; `2026-04` does not become the stable April release until April 1, 2026.

### 2. Create the host service

On Render:

1. Create a new **Web Service** from the repo.
2. Choose **Docker** runtime.
3. Add a persistent disk.
4. Mount the disk at `/var/data`.
5. Set the health check path to `/api/health`.

Any equivalent host is fine as long as it supports:

- a long-lived container
- a writable persistent disk
- inbound HTTPS

### 3. Set the environment variables

Use the variables listed above. For the current database setup, the critical one is:

```bash
DATABASE_URL=file:/var/data/prod.sqlite
```

That is the full "database connection" for this repo in production. There is no separate DB hostname for the current SQLite deployment.

### 4. Deploy the app

Push your branch and let the host build the image.

This repo's Docker flow already runs:

```bash
npm run build
```

and then on container start:

```bash
npm run docker-start
```

That includes Prisma generate plus `prisma migrate deploy`.

### 5. Verify the first deployment

After the first successful deploy, verify all of these:

- `https://your-app.onrender.com/api/health` returns `{"ok":true}`
- the service logs show Prisma migrations applied successfully
- the app opens in a browser without server errors
- the OAuth flow finishes and lands in Shopify Admin

## Sync the hosted URL back to Shopify

Shopify's `deploy` command does **not** deploy your web server. It only syncs Shopify-side configuration.

After the host URL is live:

1. update [`shopify.app.toml`](./shopify.app.toml)
2. run:

```bash
shopify app deploy
```

This syncs:

- app config
- scopes
- app-specific webhooks
- app extensions

Reference:

- [Deploy to a hosting service](https://shopify.dev/docs/apps/launch/deployment/deploy-to-hosting-service)

## How to connect to the database once the app is hosted

There are two different meanings here, and Shopify builders usually mix them together:

### 1. How the app connects to the database

That is automatic. Set:

```bash
DATABASE_URL=file:/var/data/prod.sqlite
```

Prisma reads it on boot and the app uses it through [`app/db.server.ts`](./app/db.server.ts). No extra code change is needed.

### 2. How you inspect the database yourself later

With the current SQLite-on-disk setup, there is no public database endpoint to connect to from a desktop SQL client.

Your realistic options are:

- use your host's shell access and inspect the file on disk
- copy/download the SQLite file from the persistent disk snapshot workflow your host provides
- migrate to managed Postgres if you want normal remote DB access

If you know you want regular database inspection, analytics, or multiple app instances, skip the SQLite convenience path and plan a Postgres migration before broad rollout.

## Full test plan before submission

Do not submit after only checking that the app loads. Run the full flow on the actual hosted URL.

### Install and auth

1. Install the app into a dev store from the production app configuration.
2. Confirm the app opens embedded inside Shopify Admin.
3. Confirm there are no OAuth loops and no blank iframe loads.
4. Refresh the page and confirm the session still works.

### Settings and database persistence

1. Open **Settings**.
2. Save a real IMAI API key.
3. Reload the app.
4. Confirm the masked key still appears.
5. Confirm credit balance loads again after reload.

This validates:

- session persistence
- encryption setup
- database writes to `ApiKey`

### Generation flows

Run every merchant-facing flow that matters:

1. Design generation
2. Marketing generation
3. Product or e-commerce generation
4. Library view
5. History view

For each one, confirm:

- the request is accepted
- a job row is stored
- the final result is visible in the UI
- failures show useful errors instead of hanging forever

### Webhook and live-update flow

This matters because the repo relies on asynchronous job completion.

Test that:

1. a generation request creates an `ImaiJob`
2. IMAI calls back to `/api/imai/webhook`
3. the webhook updates the job status
4. the UI reflects the completed or failed state
5. repeat deliveries do not corrupt the record

Because this app uses server-sent events in memory, this test should be run on the same kind of long-lived host you plan to use in production, not on a serverless preview.

### Uninstall and reinstall

1. Uninstall the app from the test store.
2. Confirm the `app/uninstalled` webhook fires.
3. Reinstall the app.
4. Confirm OAuth still works and the app can be used again.

### Compliance webhook check

Before submission, confirm the required compliance webhook subscription exists after `shopify app deploy`.

The handler in this repo is:

- [`app/routes/webhooks.compliance.tsx`](./app/routes/webhooks.compliance.tsx)

Current behavior:

- `shop/redact` deletes stored shop data
- customer privacy topics return `200` and log the payload because this app stores shop-scoped configuration and job metadata rather than customer records

### Failure-path checks

Also test the ugly cases, because reviewers will:

- invalid IMAI API key
- unreachable IMAI API
- invalid webhook signature when `IMAI_WEBHOOK_SECRET` is set
- empty prompt or missing required URL fields
- expired or missing Shopify session

## Public App Store submission checklist

Before you press submit in the Partner Dashboard, make sure all of this is true:

- the app is using **public distribution**
- the production URL is stable and HTTPS
- the app installs into a fresh dev store without manual hacks
- compliance webhooks are configured
- support and contact information is filled in
- an emergency developer contact is configured in the Partner Dashboard
- privacy policy and required listing content are filled in
- reviewer steps are clear and reproducible
- any required external credentials are included
- your test store is usable and not half-configured

Shopify's current review docs also call out a few items that are easy to miss:

- include a **screencast** for apps that require guided setup
- include **test credentials** if the reviewer needs them
- use currently supported Shopify APIs
- pass the automated app checks before submission

References:

- [App Store requirements](https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements)
- [Pass app review](https://shopify.dev/docs/apps/launch/app-store-review/pass-app-review)

## What to put in the reviewer notes

Keep the reviewer notes short and testable.

Example:

1. Install the app into the provided dev store.
2. Open the embedded app from Shopify Admin.
3. Go to **Settings** and use the provided IMAI API key.
4. Run one design generation and one marketing generation.
5. Open **History** and confirm both jobs complete.
6. Uninstall and reinstall the app to confirm cleanup and re-auth.

Also include:

- the test store URL
- collaborator access or store-owner login instructions
- any IMAI credential needed for testing
- anything the reviewer must wait for, such as async generation time

## Release updates after the app is approved

For later releases:

1. deploy the new web app version to your host
2. update `shopify.app.toml` if URLs, scopes, or webhooks changed
3. run `shopify app deploy`
4. regression-test install, settings, generation, history, and uninstall

## Source links used for this guide

- [Shopify: Deploy to a hosting service](https://shopify.dev/docs/apps/launch/deployment/deploy-to-hosting-service)
- [Shopify: Distribution methods](https://shopify.dev/docs/apps/launch/distribution)
- [Shopify: Submit your app for review](https://shopify.dev/docs/apps/launch/app-store-review/submit-app-for-review)
- [Shopify: Pass app review](https://shopify.dev/docs/apps/launch/app-store-review/pass-app-review)
- [Shopify: App Store requirements](https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements)
- [Shopify: Privacy law compliance](https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance)
- [Shopify: Session tokens for embedded apps](https://shopify.dev/docs/apps/build/authentication-authorization/session-tokens)
