# IMAI Studio - Environment Setup

## Required Environment Variables

Add these to your `.env` file:

```bash
# Shopify App
SHOPIFY_API_KEY=your_shopify_api_key
SHOPIFY_API_SECRET=your_shopify_api_secret
SCOPES=write_products,read_products,write_metaobject_definitions,read_metaobject_definitions
HOST=https://your-ngrok-or-production-url.ngrok-free.app

# IMAI API
IMAI_WEBHOOK_SECRET=your_imai_webhook_secret
IMAI_BASE_URL=https://imai.studio

# Database (for production)
DATABASE_URL=postgresql://user:password@localhost:5432/imai_studio

# Optional: Image Upload CDN
IMAGE_UPLOAD_CDN_URL=https://your-cdn.com
```

## Testing Locally

1. **Get IMAI API Key**
   - Sign up at https://imai.studio
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

- [ ] Encrypt API keys before storing (use AES-256)
- [ ] Set up proper database (PostgreSQL recommended)
- [ ] Configure webhook endpoint to public URL
- [ ] Set `IMAI_WEBHOOK_SECRET` for webhook verification
- [ ] Remove any mock/test data from API routes
