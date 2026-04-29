import type { LoaderFunctionArgs } from "react-router";

import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const authorization = request.headers.get("Authorization");
  const hasBearerToken = Boolean(authorization?.startsWith("Bearer "));
  const { session } = await authenticate.admin(request);

  console.info("[SessionCheck] Embedded session verified", {
    shop: session.shop,
    hasBearerToken,
  });

  return Response.json(
    {
      ok: true,
      shop: session.shop,
      hasBearerToken,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
