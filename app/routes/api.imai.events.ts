import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

// Store active SSE connections per shop
type StreamController = ReadableStreamDefaultController<Uint8Array>;
type StreamConnection = { id: string; controller: StreamController };
type RealtimeEvent = {
  type: string;
  jobId?: string;
  status?: string;
  result?: unknown;
  error?: string;
};

const activeStreams = new Map<string, StreamConnection[]>();

/**
 * GET /api/imai/events
 * Server-Sent Events endpoint for real-time job updates
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const requestedShop = url.searchParams.get('shop');
  const shop = session.shop;
  
  if (requestedShop && requestedShop !== shop) {
    return new Response("Forbidden", { status: 403 });
  }

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
    },
  });
}

/**
 * Send event to all active connections for a shop
 */
export function sendEventToShop(shop: string, event: RealtimeEvent) {
  const connections = activeStreams.get(shop);
  
  if (connections) {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    const encodedData = new TextEncoder().encode(data);

    connections.forEach(({ controller, id }) => {
      try {
        controller.enqueue(encodedData);
      } catch (error) {
        // Connection might be closed, will be cleaned up
        console.log(`Failed to send event to connection ${id}:`, error);
      }
    });
  }
}
