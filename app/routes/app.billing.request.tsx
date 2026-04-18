import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  BILLING_TEST_MODE,
} from "../lib/billing.server";
import { getPaidPlanBySlug } from "../lib/billing/plans";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, redirect } = await authenticate.admin(request);
  const url = new URL(request.url);
  const planSlug = url.searchParams.get("plan");
  const plan = getPaidPlanBySlug(planSlug);

  if (!plan) {
    return redirect("/app/billing");
  }

  const host = url.searchParams.get("host");
  const apiKey = process.env.SHOPIFY_API_KEY;
  const returnUrl =
    host && apiKey
      ? `https://${Buffer.from(host, "base64").toString("utf8")}/apps/${apiKey}/app/billing`
      : undefined;

  await billing.request({
    plan: plan.billingName,
    isTest: BILLING_TEST_MODE,
    returnUrl,
  });
};
