import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

// Store active SSE connections per shop
const activeStreams = new Map<string, Array<{ id: string; controller: ReadableStreamDefaultController }>>();

/**
 * GET /api/imai/events
 * Server-Sent Events endpoint for real-time job updates
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Create a unique ID for this connection
  const connectionId = crypto.randomUUID();

  // Set up SSE response
  const stream = new ReadableStream({
    start(controller) {
      // Add this connection to active streams
      if (!activeStreams.has(shop)) {
        activeStreams.set(shop, []);
      }
      activeStreams.get(shop)!.push({ id: connectionId, controller });

      // Send initial connection message
      const data = `data: ${JSON.stringify({ type: 'connected', connectionId })}\n\n`;
      controller.enqueue(new TextEncoder().encode(data));

      // Clean up on close
      request.signal.addEventListener('abort', () => {
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
  const connections = activeStreams.get(shop);
  if (connections) {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    const encodedData = new TextEncoder().encode(data);

    connections.forEach(({ controller }) => {
      try {
        controller.enqueue(encodedData);
      } catch (error) {
        // Connection might be closed, will be cleaned up
        console.log('Failed to send event to connection:', error);
      }
    });
  }
}
