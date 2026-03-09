# Deploying the IMAI Studio app to a Shopify store

This guide walks you through deploying this app so it can be installed and used on a Shopify store (development or production).

---

## Overview

Deploying a Shopify app has two parts:

1. **Host your app** – Run the app on a hosting service (e.g. Fly.io, Render, Google Cloud Run) so Shopify can reach it.
2. **Deploy app config to Shopify** – Use the Shopify CLI to push your app configuration and extensions so the app can be installed on stores.

---

## Prerequisites

- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli/getting-started) installed and logged in (`shopify auth login` if needed).
- A Shopify Partners account and an app created in the [Partners Dashboard](https://partners.shopify.com).
- Your app’s `shopify.app.toml` and `.env` (or production env vars) set up for the app you want to deploy.

---

## Step 1: Host your app

Your app must be reachable at a public URL. Choose one of the following (or any Node.js host).

### Option A: Fly.io (recommended for a quick deploy)

1. Install the [Fly CLI](https://fly.io/docs/hands-on/install-flyctl/).
2. From the project root (e.g. `shopify`):
   ```bash
   fly launch
   ```
   Follow the prompts (create app, region, don’t deploy yet if you want to set env first).
3. Set required environment variables (see **Environment variables** below):
   ```bash
   fly secrets set SHOPIFY_API_KEY=xxx SHOPIFY_API_SECRET=xxx DATABASE_URL=xxx
   ```
4. Deploy:
   ```bash
   npm run build
   fly deploy
   ```
5. Note your app URL (e.g. `https://your-app.fly.dev`). You’ll use this in Step 2.

### Option B: Render

1. Create a [Render](https://render.com) account and connect your repo.
2. New **Web Service** → connect this repo.
3. Build command: `npm install && npm run build`
4. Start command: `npm run start`
5. Add environment variables in the Render dashboard (see **Environment variables** below).
6. Deploy and note your service URL (e.g. `https://your-app.onrender.com`).

### Option C: Google Cloud Run

Follow the [Shopify guide for Google Cloud Run](https://shopify.dev/docs/apps/launch/deployment/deploy-to-google-cloud-run) for a full walkthrough (build, deploy, env vars, and connecting to your Shopify app).

### Option D: Any Node.js host

- Build: `npm run build`
- Start: `npm run start` (runs `react-router-serve ./build/server/index.js`)
- Ensure the server listens on the port your host provides (often `PORT`).
- Set `NODE_ENV=production` and all required env vars.

---

## Step 2: Point your Shopify app to the hosted URL

1. In your project, ensure `shopify.app.toml` (or your deployment config) uses your **production** URL:
   - `application_url` = your hosted app URL (e.g. `https://your-app.fly.dev`)
   - Auth redirect and any other URLs should match (e.g. `https://your-app.fly.dev/api/auth`).
2. If you use the CLI to manage config, you can also set the production URL in the [Partners Dashboard](https://partners.shopify.com) under your app → **App setup** → **URLs**.

---

## Step 3: Deploy app configuration and extensions to Shopify

From the **app directory** (e.g. `shopify`):

```bash
shopify app deploy
```

- This uploads your app configuration and any app extensions to Shopify and creates a new **app version**.
- If you want to create a version without releasing it to users yet, use:
  ```bash
  shopify app deploy --no-release
  ```
- To release an existing version later:
  ```bash
  shopify app release --version=VERSION
  ```

After a successful deploy, the new version is available for stores that have your app installed (or for new installs).

---

## Step 4: Install the app on a store

- **Development store:** In [Partners](https://partners.shopify.com) go to **Apps** → your app → **Test your app** (or use the install link from the CLI).
- **Production:** Submit your app for review if you’re listing it; otherwise use a custom install link or install from your Partners app page for stores you invite.

Once installed, merchants open the app from their Shopify Admin; the embedded app loads from your hosted URL.

---

## Environment variables (production)

Set these on your hosting provider (and in `shopify.app.toml` / Partners where applicable):

| Variable | Description |
|----------|-------------|
| `NODE_ENV` | `production` |
| `SHOPIFY_API_KEY` | From Partners → your app → **Client ID** |
| `SHOPIFY_API_SECRET` | From Partners → your app → **Client secret** |
| `DATABASE_URL` | Production database URL (e.g. PostgreSQL). SQLite is only suitable for single-instance dev. |
| `SCOPES` | Same scopes as in `shopify.app.toml` (e.g. `write_products`, `read_products`, etc.) |

For IMAI Studio–specific features (API key storage, webhooks, etc.), also configure any keys or secrets your app reads from the environment (see [INSTRUCTIONS.md](./INSTRUCTIONS.md)).

---

## Summary checklist

1. Host the app (Fly.io, Render, GCP Run, or another Node host).
2. Set production URL in `shopify.app.toml` and Partners.
3. Set all required environment variables (including `NODE_ENV=production`).
4. Run `shopify app deploy` from the app directory.
5. Install the app on a dev or production store from the Partners dashboard or install link.

For more detail, see [Shopify deployment docs](https://shopify.dev/docs/apps/launch/deployment) and [Deploy app versions](https://shopify.dev/docs/apps/launch/deployment/deploy-app-versions).
