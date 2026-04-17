# 🚀 Quick Start Guide

## One-Command Development Setup

To start your Shopify app development server with automatic tunnel setup, simply run:

```bash
./simple-start.sh
```

## What This Script Does

The updated `start-dev.sh` script now properly handles the Shopify development flow:

1. **🛍️ Starts Shopify dev first** - Launches `shopify app dev --use-localhost` to get the actual port
2. **🔍 Detects the real port** - Automatically finds which port Shopify is actually using
3. **📡 Starts ngrok tunnel** - Creates tunnel to the correct port (not hardcoded 3000)
4. **🔧 Updates configuration** - Updates `shopify.app.toml` with the tunnel URL
5. **� Monitors both services** - Keeps both Shopify and ngrok running
6. **🧹 Auto cleanup** - Stops all services when you press Ctrl+C

## How It Fixes the Connection Error

The previous script failed because:
- It assumed Shopify runs on port 3000 (it doesn't)
- Ngrok couldn't connect to a non-existent service

The new script:
- Starts Shopify first to discover the actual port
- Creates ngrok tunnel to the correct port
- Ensures both services stay connected

## Manual Setup (Alternative)

If you prefer to set up manually:

1. Start Shopify dev:
   ```bash
   shopify app dev --use-localhost
   ```

2. Find the port (look for "Local: http://localhost:XXXXX")

3. Start ngrok on that port:
   ```bash
   ngrok http YOUR_PORT
   ```

4. Update `shopify.app.toml` with your ngrok URL

## Troubleshooting

- **Port detection issues**: Make sure Shopify fully starts before ngrok
- **Ngrok connection**: The script now waits for both services to be ready
- **Permissions**: Ensure script has execute permissions (`chmod +x start-dev.sh`)

## Development URLs

Once running, your app will be available at:
- **Local**: http://localhost:[detected-port] (shown in script output)
- **Tunnel**: Your ngrok URL (shown in script output)
- **Shopify Admin**: Via your dev store `imai-dev-store.myshopify.com`
