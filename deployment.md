# Deploying the IMAI Studio app to Vercel

This guide walks you through deploying this Shopify app **on Vercel** from start to finish: preparing the project, setting up the database, configuring Vercel, updating Shopify, and letting users install the app.

References: [Shopify – Deploy to a hosting service](https://shopify.dev/docs/apps/launch/deployment/deploy-to-hosting-service), [Vercel – React Router](https://vercel.com/docs/frameworks/frontend/react-router), [Prisma – Deploy to Vercel](https://www.prisma.io/docs/orm/prisma-client/deployment/serverless/deploy-to-vercel).

---

## What you’ll do

1. **Prepare the app** – Switch to PostgreSQL, add Vercel’s React Router preset, and ensure the build runs on Vercel.
2. **Create a production database** – PostgreSQL (e.g. Vercel Postgres or Neon) with a connection URL for serverless.
3. **Deploy to Vercel** – Connect the repo, set environment variables, and deploy.
4. **Point Shopify at Vercel** – Set `application_url` and redirect URLs in `shopify.app.toml`, then run `shopify app deploy`.
5. **Install and test** – Install the app in a dev store and (optionally) distribute to other merchants.

**URL / subdomain:** Shopify does not require a specific subdomain. You can use your Vercel URL (e.g. `https://your-app.vercel.app`) or a [custom domain](https://vercel.com/docs/projects/domains) (e.g. `https://app.yourdomain.com`).

---

## Prerequisites

- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli/getting-started) installed and logged in (`shopify auth login`).
- A [Shopify Partners](https://partners.shopify.com) account and an app created in the dashboard.
- A [Vercel](https://vercel.com) account (GitHub/GitLab/Bitbucket connected).
- Your app working locally (e.g. with `./simple-start.sh` and ngrok) so you have credentials and scopes.

---

## Step 1: Get your Shopify app credentials

From the project root:

```bash
shopify app config link   # if you don’t already have an app linked
shopify app env show
```

Note:

- **SHOPIFY_API_KEY** (Client ID)
- **SHOPIFY_API_SECRET** (Client secret)
- **SCOPES** (comma‑separated; should match `shopify.app.toml`)

You’ll add these in Vercel later. See [Shopify: Create an app configuration file](https://shopify.dev/docs/apps/launch/deployment/deploy-to-hosting-service#step-1-create-an-app-configuration-file).

---

## Step 2: Switch the app to PostgreSQL

Vercel runs your app as serverless functions. SQLite is not suitable (no persistent filesystem). Use **PostgreSQL** and a **pooled** connection URL for serverless.

### 2.1 Create a PostgreSQL database

Use one of:

- **[Vercel Postgres](https://vercel.com/docs/storage/vercel-postgres)** – Project → Storage → Create Database → Postgres. Vercel will add `POSTGRES_URL` (or similar) to the project.
- **[Neon](https://neon.tech)** – Create a project and copy the connection string. Prefer the **pooled** (e.g. “pooler”) URL if shown.
- **[Prisma Postgres](https://www.prisma.io/docs/guides/postgres/vercel)** – Via Vercel integration; provides a pooled URL.

For serverless, use a **connection pooler** (e.g. URL with `?pgbouncer=true` or a “pooler” host). See [Prisma: Connection pooling](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections#connection-pooling).

### 2.2 Update Prisma schema

Edit `prisma/schema.prisma` so the datasource uses PostgreSQL and an env var:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

Keep all existing models (e.g. `Session`, `ApiKey`, `ImaiJob`) as they are.

### 2.3 Run migrations and generate client (locally)

Set `DATABASE_URL` in `.env` to your **production** Postgres URL (or a copy of it), then:

```bash
npx prisma migrate deploy
npx prisma generate
```

If you haven’t created migrations yet:

```bash
npx prisma migrate dev --name init
```

Then run `prisma migrate deploy` against the production DB when ready.

### 2.4 Ensure Prisma runs at build time on Vercel

In `package.json`, add a `postinstall` so Prisma Client is generated on every deploy:

```json
"scripts": {
  "postinstall": "prisma generate",
  "build": "prisma generate && prisma migrate deploy && react-router build",
  ...
}
```

If you prefer to run migrations outside Vercel (e.g. in CI), you can use:

```json
"build": "prisma generate && react-router build",
```

and run `prisma migrate deploy` in your own pipeline before or after deploy.

---

## Step 3: Add Vercel’s React Router preset (recommended)

Vercel can deploy React Router with zero config, but the preset improves bundle splitting and deployment behavior.

### 3.1 Install the package

```bash
npm i @vercel/react-router
```

### 3.2 Create or update React Router config

If your project does **not** have a `react-router.config.ts` in the root, create it. If it does, add the preset there.

Create **`react-router.config.ts`** in the project root:

```ts
import type { Config } from "@react-router/dev/config";
import { vercelPreset } from "@vercel/react-router/vite";

export default {
  ssr: true,
  presets: [vercelPreset()],
} satisfies Config;
```

If you already have other options (e.g. `appDirectory`, `buildDirectory`), keep them and only add `presets: [vercelPreset()]` and ensure `ssr: true` if you need SSR.

See [Vercel: React Router Preset](https://vercel.com/docs/frameworks/frontend/react-router#vercel-react-router-preset).

---

## Step 4: Create the Vercel project and set env vars

### 4.1 Import the project on Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard).
2. **Add New** → **Project**.
3. Import the Git repository that contains this app (e.g. GitHub).
4. Select the repo and leave **Root Directory** as `.` unless the app lives in a subdirectory.

### 4.2 Configure build and output

- **Framework Preset:** Vercel should detect **React Router** (or Remix). If not, you can leave as “Other” and rely on the build command.
- **Build Command:**  
  `npm run build`  
  (This uses the `build` script that includes `prisma generate` and optionally `prisma migrate deploy`.)
- **Output Directory:** Leave default (Vercel uses the React Router build output when the preset is used).
- **Install Command:** `npm ci` or `npm install`.

Do **not** set a custom “Start” or “Run” command; Vercel will run the app as serverless functions.

### 4.3 Environment variables

In the project: **Settings → Environment Variables**. Add these for **Production** (and optionally Preview, with separate values if needed):

| Name | Value | Notes |
|------|--------|--------|
| `NODE_ENV` | `production` | |
| `SHOPIFY_APP_URL` | `https://your-app.vercel.app` | Your Vercel production URL; no trailing slash. Use your real project URL after first deploy. |
| `SHOPIFY_API_KEY` | *(from Step 1)* | Client ID from Partners. |
| `SHOPIFY_API_SECRET` | *(from Step 1)* | Client secret; keep secret. |
| `SCOPES` | *(from Step 1)* | Same as in `shopify.app.toml`, e.g. `write_metaobject_definitions,write_metaobjects,write_products,write_files`. |
| `DATABASE_URL` | *(your Postgres URL)* | Pooled connection string from Step 2. |

**IMAI Studio–specific** (see [INSTRUCTIONS.md](./INSTRUCTIONS.md)):

- `IMAI_API_KEY`, `IMAI_WEBHOOK_SECRET`, `IMAI_BASE_URL`
- `R2_BASE_URL` (if you use Cloudflare R2)
- Any other keys your app reads from `process.env`

**Important:** Set `SHOPIFY_APP_URL` to the **exact** URL where the app will be loaded (e.g. `https://your-project.vercel.app`). After the first deploy you can confirm the URL in Vercel and update this if you use a custom domain later.

---

## Step 5: First deploy on Vercel

1. Save all settings and trigger a deploy (e.g. **Deploy** from the project page, or push a commit).
2. Wait for the build to finish. Fix any errors (e.g. missing env var, Prisma migration failure).
3. Copy the **production URL** (e.g. `https://your-app.vercel.app`).

If you had set `SHOPIFY_APP_URL` to a placeholder, update it in **Settings → Environment Variables** to this URL and redeploy once.

---

## Step 6: Point Shopify at your Vercel URL

Shopify must know your app’s public URL and where to redirect after OAuth.

### 6.1 Update `shopify.app.toml`

Set `application_url` and `redirect_urls` to your **Vercel URL** (same as `SHOPIFY_APP_URL`). This app uses `/api/auth` for the auth callback:

```toml
application_url = "https://your-app.vercel.app"

[auth]
redirect_urls = [ "https://your-app.vercel.app/api/auth" ]
```

Replace `https://your-app.vercel.app` with your real Vercel URL (or custom domain). No trailing slash.

### 6.2 Deploy app config and extensions to Shopify

From the **app directory** (project root):

```bash
shopify app config use   # select the app you’re deploying
shopify app deploy
```

This pushes your app configuration and extensions to Shopify and creates a new app version. See [Shopify: Deploy your configuration](https://shopify.dev/docs/apps/launch/deployment/deploy-to-hosting-service#step-5-deploy-your-configuration).

To create a version without releasing it yet:

```bash
shopify app deploy --no-release
```

To release an existing version later:

```bash
shopify app release --version=VERSION
```

---

## Step 7: Install and test the app

### 7.1 Install on a development store

1. In the [Partners Dashboard](https://partners.shopify.com), open your app.
2. Go to **Apps** → your app → **Test your app** (or use the install link from the CLI).
3. Choose a development store and install.
4. Open the app from the store’s admin. It should load from your Vercel URL (embedded in the admin).

If something fails (e.g. redirect, session), check:

- `SHOPIFY_APP_URL` in Vercel matches `application_url` and has no trailing slash.
- `redirect_urls` in `shopify.app.toml` is exactly `https://<your-vercel-url>/api/auth`.
- You ran `shopify app deploy` after changing URLs.

### 7.2 Let other users install the app

- **Custom install link:** In Partners → your app → **Distribution** (or **App setup**), copy the install link and share it with merchants.
- **App Store:** Submit the app for listing so merchants can find it in the Shopify App Store.
- **Direct:** Merchants can also install from your app’s page in the Partners dashboard if you share the install URL.

Once installed, the app runs from your Vercel deployment; no ngrok or local URL is needed.

---

## Step 8: Optional – custom domain and re-deploys

### Custom domain

1. In Vercel: **Project → Settings → Domains**, add a domain (e.g. `app.yourdomain.com`).
2. Set `SHOPIFY_APP_URL` to that URL (e.g. `https://app.yourdomain.com`).
3. In `shopify.app.toml`, set `application_url` and `redirect_urls` to the same URL (e.g. `https://app.yourdomain.com`, `https://app.yourdomain.com/api/auth`).
4. Run `shopify app deploy` again.
5. Redeploy on Vercel (or let the next Git push deploy).

### Re-deploying after changes

**Code/config that affects Shopify (URLs, extensions, scopes):**

1. Update `shopify.app.toml` if needed.
2. Run:
   ```bash
   shopify app config use
   shopify app deploy
   ```

**Code-only changes:**

- Push to Git; Vercel will build and deploy. No need to run `shopify app deploy` unless you changed app config or extensions.

**Switching back to local development:**

- Run `shopify app config use` and select your development app so local/ngrok URLs are used again for that config.

---

## Environment variables reference (Vercel)

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | Yes | `production` |
| `SHOPIFY_APP_URL` | Yes | Full app URL (e.g. `https://your-app.vercel.app`). Must match `application_url` in `shopify.app.toml`. |
| `SHOPIFY_API_KEY` | Yes | Partners → your app → Client ID. |
| `SHOPIFY_API_SECRET` | Yes | Partners → your app → Client secret. |
| `SCOPES` | Yes* | Same as in `shopify.app.toml` (*optional if using Shopify-managed installation). |
| `DATABASE_URL` | Yes | PostgreSQL connection string (prefer pooled for serverless). |

Plus any IMAI/R2/other keys your app uses (see [INSTRUCTIONS.md](./INSTRUCTIONS.md)).

---

## Summary checklist

- [ ] **Step 1:** Run `shopify app env show` and note `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SCOPES`.
- [ ] **Step 2:** Create PostgreSQL DB (e.g. Vercel Postgres or Neon). Update `prisma/schema.prisma` to `provider = "postgresql"` and `url = env("DATABASE_URL")`. Run `prisma migrate deploy` and add `postinstall` / `build` scripts for Prisma.
- [ ] **Step 3:** Install `@vercel/react-router` and add `react-router.config.ts` with `vercelPreset()` and `ssr: true`.
- [ ] **Step 4:** Create Vercel project, set build command to `npm run build`, add all env vars (including `SHOPIFY_APP_URL` = your Vercel URL and `DATABASE_URL`).
- [ ] **Step 5:** Deploy on Vercel and copy the production URL.
- [ ] **Step 6:** Set `application_url` and `redirect_urls` in `shopify.app.toml` to that URL (redirect = `.../api/auth`). Run `shopify app deploy`.
- [ ] **Step 7:** Install the app on a dev store from the Partners dashboard and test; share install link or submit to the App Store for other users.

**References**

- [Shopify: Deploy to a hosting service](https://shopify.dev/docs/apps/launch/deployment/deploy-to-hosting-service)
- [Shopify: About deployment](https://shopify.dev/docs/apps/launch/deployment)
- [Vercel: React Router](https://vercel.com/docs/frameworks/frontend/react-router)
- [Prisma: Deploy to Vercel](https://www.prisma.io/docs/orm/prisma-client/deployment/serverless/deploy-to-vercel)
