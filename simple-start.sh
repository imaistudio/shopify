#!/bin/bash

echo "🚀 Starting Shopify app with tunnel..."

# Kill any existing processes
pkill -f ngrok 2>/dev/null || true
pkill -f "shopify app dev" 2>/dev/null || true

# Start ngrok tunnel
echo "📡 Starting ngrok tunnel..."
ngrok http 8443 --log=stdout > /tmp/ngrok.log 2>&1 &
NGROK_PID=$!

# Wait for ngrok to start
echo "⏳ Waiting for ngrok URL..."
sleep 5

# Get the ngrok URL
NGROK_URL=$(curl -s http://127.0.0.1:4040/api/tunnels | grep -o 'https://[^"]*ngrok[^"]*' | head -1)

if [ -z "$NGROK_URL" ]; then
    echo "❌ Failed to get ngrok URL"
    kill $NGROK_PID 2>/dev/null
    exit 1
fi

echo "✅ Ngrok tunnel created: $NGROK_URL"

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
echo "📝 Your app will be available at: $NGROK_URL"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

shopify app dev --tunnel-url=${NGROK_URL}:8443

cleanup
