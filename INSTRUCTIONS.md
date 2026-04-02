# IMAI.Studio - Environment Setup

This file reflects the code that is currently in this repo.

## Required environment variables

### Local development

Add these to your local `.env` file:

```bash
SHOPIFY_API_KEY=your_shopify_api_key
SHOPIFY_API_SECRET=your_shopify_api_secret
SHOPIFY_APP_URL=https://your-ngrok-or-localhost-url
SCOPES=read_products,write_products,write_files
DATABASE_URL=file:./dev.sqlite
ENCRYPTION_KEY=use-a-random-32-plus-character-secret
IMAI_WEBHOOK_SECRET=your_imai_webhook_secret
SHOPIFY_BILLING_TEST_MODE=true
IMAI_BILLING_SYNC_URL=https://www.imai.studio/api/v1/shopify/billing/allocate-credits
```

### Production

For Railway or any other Docker host, use:

```bash
NODE_ENV=production
SHOPIFY_API_KEY=your_shopify_api_key
SHOPIFY_API_SECRET=your_shopify_api_secret
SHOPIFY_APP_URL=https://imai.up.railway.app
SCOPES=read_products,write_products,write_files
DATABASE_URL=file:/var/data/prod.sqlite
ENCRYPTION_KEY=use-a-random-32-plus-character-secret
IMAI_WEBHOOK_SECRET=your_imai_webhook_secret
SHOPIFY_BILLING_TEST_MODE=false
IMAI_BILLING_SYNC_URL=https://www.imai.studio/api/v1/shopify/billing/allocate-credits
```

## Variables this repo does not currently use

Do not add these expecting the app to read them:

- `IMAI_API_KEY`
- `IMAI_BASE_URL`
- `R2_BASE_URL`
- `IMAGE_UPLOAD_CDN_URL`

Why:

- merchants enter their own IMAI API key inside the app, and the app stores it encrypted per shop
- IMAI endpoints are hardcoded to `https://www.imai.studio`
- uploads currently use `tempfile.org`, not your own R2 bucket or CDN

## Billing-specific notes

- The app now uses Shopify manual subscription billing for recurring plans:
  - Monthly
    - `IMAI Starter Monthly` at `$20/month`
    - `IMAI Pro Monthly` at `$100/month`
    - `IMAI Ultra Monthly` at `$200/month`
  - Annual
    - `IMAI Starter Annual` at `$240/year`
    - `IMAI Pro Annual` at `$1,200/year`
    - `IMAI Ultra Annual` at `$2,400/year`
- Free remains the no-subscription state in Shopify.
- `SHOPIFY_BILLING_TEST_MODE=true` should stay enabled in local development.
- `IMAI_BILLING_SYNC_URL` must point to an IMAI endpoint that grants monthly credits idempotently using the posted `grantKey`.
- The app grants credits in monthly windows for both monthly and annual subscriptions.

## Testing Locally

1. **Get IMAI API Key**
   - Sign up at https://www.imai.studio
   - Go to Settings → API Keys
   - Generate a key with scopes: `credits:read`, `library:read`, `generate:write`

2. **Start Development Server**
   ```bash
   npm install
   ./simple-start.sh
   ```

3. **Install App in Shopify**
   - Follow the CLI prompts to install in your dev store
   - The app will appear in Shopify Admin under Apps

4. **Connect API Key**
   - Open the IMAI.Studio app in Shopify Admin
   - Go to Settings tab
   - Paste your IMAI API key and click Connect
   - The key is stored encrypted in the app database for that shop

5. **Generate Images**
   - Go to Generate tab
   - Enter a prompt
   - Optional: Upload a reference image
   - Click Generate

## Production Checklist

- [ ] Set `ENCRYPTION_KEY` in production
- [ ] Mount persistent storage at `/var/data`
- [ ] Set `DATABASE_URL=file:/var/data/prod.sqlite`
- [ ] Run a single app instance
- [ ] Configure webhook endpoint to public URL
- [ ] Set `IMAI_WEBHOOK_SECRET` for webhook verification
- [ ] Set `IMAI_BILLING_SYNC_URL` to the IMAI credit allocation endpoint
- [ ] Set `SHOPIFY_BILLING_TEST_MODE=false` in production
- [ ] Run `shopify app deploy` after updating production URLs
- [ ] Verify compliance webhooks are subscribed before App Store submission
- [ ] Verify `app_subscriptions/update` webhook is subscribed after deploy
- [ ] Reinstall or reauthorize the app after changing scopes so Shopify issues a token with `read_products` and `write_products`
