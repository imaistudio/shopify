#!/bin/bash

echo "🚀 Starting Shopify app with tunnel..."

export DATABASE_URL="${DATABASE_URL:-file:./dev.sqlite}"
echo "🗄️  Using DATABASE_URL=$DATABASE_URL"
LOCAL_SHOPIFY_PROXY_PORT="${LOCAL_SHOPIFY_PROXY_PORT:-8443}"
LOCAL_SHOPIFY_PROXY_URL="https://localhost:${LOCAL_SHOPIFY_PROXY_PORT}"

# Kill any existing processes
pkill -f ngrok 2>/dev/null || true
pkill -f "shopify app dev" 2>/dev/null || true

# Start ngrok tunnel
echo "📡 Starting ngrok tunnel..."
ngrok http "$LOCAL_SHOPIFY_PROXY_URL" --log=stdout > /tmp/ngrok.log 2>&1 &
NGROK_PID=$!

# Wait for ngrok to start
echo "⏳ Waiting for ngrok URL..."
NGROK_URL=""
for _ in $(seq 1 15); do
    NGROK_URL=$(curl -s http://127.0.0.1:4040/api/tunnels | grep -o 'https://[^"]*ngrok[^"]*' | head -1)
    if [ -n "$NGROK_URL" ]; then
        break
    fi
    sleep 1
done

if [ -z "$NGROK_URL" ]; then
    echo "❌ Failed to get ngrok URL"
    echo "🪵 Last ngrok log lines:"
    tail -20 /tmp/ngrok.log
    kill $NGROK_PID 2>/dev/null
    exit 1
fi

echo "✅ Ngrok tunnel created: $NGROK_URL"

# Shopify CLI uses the port in --tunnel-url as the local proxy bind port, so it
# must match the localhost port ngrok forwards to rather than the public HTTPS
# default port.
SHOPIFY_TUNNEL_URL="${NGROK_URL}:${LOCAL_SHOPIFY_PROXY_PORT}"

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Stopping services..."
    kill $NGROK_PID 2>/dev/null
    pkill -f "shopify app dev" 2>/dev/null
    echo "✅ All services stopped"
    exit 0
}

# Set up trap for cleanup
trap cleanup SIGINT SIGTERM

# Start Shopify dev with tunnel
echo "🛍️  Starting Shopify development server..."
echo "📝 Ngrok URL: $NGROK_URL"
echo "📝 Shopify tunnel URL: $SHOPIFY_TUNNEL_URL"
echo "📝 Your app will be available at: $NGROK_URL"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

shopify app dev --tunnel-url="$SHOPIFY_TUNNEL_URL"

cleanup
