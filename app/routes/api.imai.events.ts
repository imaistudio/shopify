import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

// Store active SSE connections per shop
const activeStreams = new Map<string, Array<{ id: string; controller: ReadableStreamDefaultController }>>();

/**
 * GET /api/imai/events
 * Server-Sent Events endpoint for real-time job updates
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shop = url.searchParams.get('shop');
  
  if (!shop) {
    return new Response('Shop parameter required', { status: 400 });
  }

  // Create a unique ID for this connection
  const connectionId = crypto.randomUUID();

  // Set up SSE response
  const stream = new ReadableStream({
    start(controller) {
      console.log(`SSE connection starting for shop: ${shop}, connectionId: ${connectionId}`);
      
      // Add this connection to active streams
      if (!activeStreams.has(shop)) {
        activeStreams.set(shop, []);
        console.log(`Created new connection pool for shop: ${shop}`);
      }
      activeStreams.get(shop)!.push({ id: connectionId, controller });
      console.log(`Added connection ${connectionId} to pool for ${shop}. Total connections: ${activeStreams.get(shop)!.length}`);

      // Send initial connection message
      const data = `data: ${JSON.stringify({ type: 'connected', connectionId })}\n\n`;
      controller.enqueue(new TextEncoder().encode(data));
      console.log(`Sent connection message to ${connectionId}`);

      // Clean up on close
      request.signal.addEventListener('abort', () => {
        console.log(`SSE connection aborted for ${connectionId}, shop: ${shop}`);
        const connections = activeStreams.get(shop);
        if (connections) {
          const index = connections.findIndex(conn => conn.id === connectionId);
          if (index !== -1) {
            connections.splice(index, 1);
            console.log(`Removed connection ${connectionId} from pool for ${shop}. Remaining: ${connections.length}`);
          }
          if (connections.length === 0) {
            activeStreams.delete(shop);
            console.log(`Removed connection pool for shop: ${shop}`);
          }
        }
      });
    },
    cancel() {
      // Clean up on cancel
      const connections = activeStreams.get(shop);
      if (connections) {
        const index = connections.findIndex(conn => conn.id === connectionId);
        if (index !== -1) {
          connections.splice(index, 1);
        }
        if (connections.length === 0) {
          activeStreams.delete(shop);
        }
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    },
  });
}

/**
 * Send event to all active connections for a shop
 */
export function sendEventToShop(shop: string, event: any) {
  console.log(`sendEventToShop called for shop: ${shop}, event type: ${event.type}`);
  const connections = activeStreams.get(shop);
  console.log(`Active connections for ${shop}: ${connections?.length || 0}`);
  
  if (connections) {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    const encodedData = new TextEncoder().encode(data);
    console.log(`Sending event data:`, data);

    connections.forEach(({ controller, id }) => {
      try {
        controller.enqueue(encodedData);
        console.log(`Successfully sent event to connection: ${id}`);
      } catch (error) {
        // Connection might be closed, will be cleaned up
        console.log(`Failed to send event to connection ${id}:`, error);
      }
    });
  } else {
    console.log(`No active connections found for shop: ${shop}`);
    console.log(`Active shops:`, Array.from(activeStreams.keys()));
  }
}
