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

  const returnUrl = new URL("/app/billing", request.url).toString();

  await billing.request({
    plan: plan.billingName,
    isTest: BILLING_TEST_MODE,
    returnUrl,
  });
};

