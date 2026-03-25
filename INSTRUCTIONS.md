# IMAI Studio - Environment Setup

## Required Environment Variables

Add these to your `.env` file:

```bash
# Shopify App
SHOPIFY_API_KEY=your_shopify_api_key
SHOPIFY_API_SECRET=your_shopify_api_secret
SHOPIFY_APP_URL=https://your-ngrok-or-production-url.ngrok-free.app
SCOPES=write_metaobject_definitions,write_metaobjects,write_products,write_files

# IMAI API
IMAI_API_KEY=your_imai_api_key
IMAI_WEBHOOK_SECRET=your_imai_webhook_secret
IMAI_BASE_URL=https://www.imai.studio

# App secrets
ENCRYPTION_KEY=use-a-random-32-plus-character-secret

# Cloudflare R2 Storage
R2_BASE_URL=https://your-r2-bucket.your-account.r2.cloudflarestorage.com

# Database
DATABASE_URL=file:./dev.sqlite

# Optional: Image Upload CDN
IMAGE_UPLOAD_CDN_URL=https://your-cdn.com
```

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

5. **Generate Images**
   - Go to Generate tab
   - Enter a prompt
   - Optional: Upload a reference image
   - Click Generate

## Production Checklist

- [ ] Set `ENCRYPTION_KEY` in production
- [ ] Use a persistent production database path or move to PostgreSQL
- [ ] Configure webhook endpoint to public URL
- [ ] Set `IMAI_WEBHOOK_SECRET` for webhook verification
- [ ] Run `shopify app deploy` after updating production URLs
- [ ] Verify compliance webhooks are subscribed before App Store submission
