# IMAI Studio - Environment Setup

This file reflects the code that is currently in this repo.

## Required environment variables

### Local development

Add these to your local `.env` file:

```bash
SHOPIFY_API_KEY=your_shopify_api_key
SHOPIFY_API_SECRET=your_shopify_api_secret
SHOPIFY_APP_URL=https://your-ngrok-or-localhost-url
SCOPES=write_metaobject_definitions,write_metaobjects,write_products,write_files
DATABASE_URL=file:./dev.sqlite
ENCRYPTION_KEY=use-a-random-32-plus-character-secret
IMAI_WEBHOOK_SECRET=your_imai_webhook_secret
```

### Production

For Railway or any other Docker host, use:

```bash
NODE_ENV=production
SHOPIFY_API_KEY=your_shopify_api_key
SHOPIFY_API_SECRET=your_shopify_api_secret
SHOPIFY_APP_URL=https://your-production-domain
SCOPES=write_metaobject_definitions,write_metaobjects,write_products,write_files
DATABASE_URL=file:/var/data/prod.sqlite
ENCRYPTION_KEY=use-a-random-32-plus-character-secret
IMAI_WEBHOOK_SECRET=your_imai_webhook_secret
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
   - Open the IMAI Studio app in Shopify Admin
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
- [ ] Run `shopify app deploy` after updating production URLs
- [ ] Verify compliance webhooks are subscribed before App Store submission
