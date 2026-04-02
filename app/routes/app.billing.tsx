import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Divider,
  InlineStack,
  Page,
  Text,
} from "@shopify/polaris";
import prisma from "../db.server";
import {
  BILLING_TEST_MODE,
  getBillingReturnUrl,
  syncShopBillingState,
} from "../lib/billing.server";
import {
  ANNUAL_PLAN_CARDS,
  BillingIntervalView,
  FREE_PLAN,
  MONTHLY_PLAN_CARDS,
  PAID_PLAN_NAMES,
  getDefaultPlanView,
  getPaidPlanBySlug,
} from "../lib/billing/plans";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  const syncedBilling = await syncShopBillingState({
    shop: session.shop,
    billing,
  });

  const storedKey = await prisma.apiKey.findUnique({
    where: { shop: session.shop },
    select: { maskedKey: true },
  });
  const searchParams = new URL(request.url).searchParams;

  return {
    shop: session.shop,
    monthlyPlans: MONTHLY_PLAN_CARDS,
    annualPlans: ANNUAL_PLAN_CARDS,
    isImaiConnected: !!storedKey,
    billingTestMode: BILLING_TEST_MODE,
    currentPlanSlug: syncedBilling.activePlan.slug,
    currentPlanNameWithInterval: syncedBilling.activePlan.nameWithInterval,
    currentPlanInterval: syncedBilling.activePlan.billingInterval,
    creditAllocation: syncedBilling.creditAllocation,
    returnedFromBilling: searchParams.get("billing_return") === "1",
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "subscribe") {
    const slug = formData.get("plan");
    const plan = getPaidPlanBySlug(typeof slug === "string" ? slug : null);

    if (!plan) {
      return { error: "Select a valid paid plan before continuing." };
    }

    return billing.request({
      plan: plan.billingName,
      isTest: BILLING_TEST_MODE,
      returnUrl: getBillingReturnUrl(new URL(request.url)),
    });
  }

  if (intent === "cancel") {
    const billingCheck = await billing.check({
      plans: [...PAID_PLAN_NAMES],
      isTest: BILLING_TEST_MODE,
    });
    const activeSubscription =
      billingCheck.appSubscriptions.find(
        (subscription) => subscription.status === "ACTIVE",
      ) ?? billingCheck.appSubscriptions[0];

    if (!activeSubscription) {
      return { error: "There is no active paid Shopify subscription to cancel." };
    }

    await billing.cancel({
      subscriptionId: activeSubscription.id,
      isTest: activeSubscription.test || BILLING_TEST_MODE,
      prorate: false,
    });

    await syncShopBillingState({
      shop: session.shop,
      billing,
    });

    return {
      success: true,
      message:
        "Cancelled the current Shopify subscription. Existing IMAI credits are left untouched.",
    };
  }

  return { error: "Unknown billing action." };
};

export default function BillingPage() {
  const {
    monthlyPlans,
    annualPlans,
    isImaiConnected,
    billingTestMode,
    currentPlanSlug,
    currentPlanNameWithInterval,
    currentPlanInterval,
    creditAllocation,
    returnedFromBilling,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [selectedInterval, setSelectedInterval] = useState<BillingIntervalView>(
    getDefaultPlanView(currentPlanInterval),
  );

  const submittingIntent = navigation.formData?.get("intent");
  const submittingPlan = navigation.formData?.get("plan");
  const plans =
    selectedInterval === "annual" ? annualPlans : monthlyPlans;

  return (
    <Page title="Billing">
      <style>{`
        .billing-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 24px;
        }

        .billing-grid > * {
          height: 100%;
        }

        .plan-card-content {
          display: flex;
          flex-direction: column;
          height: 100%;
          gap: 24px;
        }

        .plan-card-cta {
          margin-top: auto;
        }

        @media (max-width: 1200px) {
          .billing-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 680px) {
          .billing-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <BlockStack gap="400">
        {actionData?.error ? (
          <Banner tone="critical" title="Billing action failed">
            {actionData.error}
          </Banner>
        ) : null}

        {actionData?.success ? (
          <Banner tone="success" title="Subscription updated">
            {actionData.message}
          </Banner>
        ) : null}

        {returnedFromBilling && currentPlanSlug !== FREE_PLAN.slug ? (
          <Banner tone="success" title="Shopify billing approved">
            {`The shop is now on ${currentPlanNameWithInterval}.`}
          </Banner>
        ) : null}

        {!isImaiConnected && currentPlanSlug !== FREE_PLAN.slug ? (
          <Banner tone="warning" title="IMAI credit sync is waiting">
            Connect an IMAI API key in Settings before paid Shopify plans can
            grant monthly credits to the merchant account.
          </Banner>
        ) : null}

        {isImaiConnected && creditAllocation.state === "failed" ? (
          <Banner tone="critical" title="IMAI credit sync failed">
            {creditAllocation.message}
          </Banner>
        ) : null}

        {billingTestMode ? (
          <Banner tone="info" title="Test billing mode is enabled">
            Development stores will create test subscriptions instead of real
            charges while <code>SHOPIFY_BILLING_TEST_MODE</code> is enabled.
          </Banner>
        ) : null}

        <Box paddingBlockEnd="100">
          <Text as="p" tone="subdued">
            Both monthly and annual recurring plans are wired through Shopify&apos;s
            Billing API. Annual plans use the same monthly credit allotment with
            no discount, billed upfront for the year.
          </Text>
        </Box>

        <BlockStack gap="400">
          <InlineStack align="center">
            <div
              style={{
                display: "inline-flex",
                padding: 4,
                border: "1px solid var(--p-color-border-secondary)",
                borderRadius: 999,
                gap: 4,
                background: "var(--p-color-bg-surface)",
              }}
            >
              {(["annual", "monthly"] as BillingIntervalView[]).map((interval) => {
                const isActive = selectedInterval === interval;
                return (
                  <button
                    key={interval}
                    type="button"
                    onClick={() => setSelectedInterval(interval)}
                    style={{
                      border: "none",
                      borderRadius: 999,
                      padding: "10px 18px",
                      fontWeight: 600,
                      cursor: "pointer",
                      background: isActive ? "#111111" : "transparent",
                      color: isActive ? "#ffffff" : "#6b7280",
                    }}
                  >
                    {interval === "annual" ? "Yearly" : "Monthly"}
                  </button>
                );
              })}
            </div>
          </InlineStack>

          <div className="billing-grid">
            {[FREE_PLAN, ...plans].map((plan) => {
              const isCurrentPlan = currentPlanSlug === plan.slug;
              const isSubmittingThisPlan =
                submittingIntent === "subscribe" && submittingPlan === plan.slug;

              return (
                <Card key={plan.slug}>
                  <Box padding="400">
                    <div className="plan-card-content">
                      <BlockStack gap="300">
                        <InlineStack align="space-between" blockAlign="center">
                          <Text as="h2" variant="headingLg">
                            {plan.name}
                          </Text>
                          {isCurrentPlan ? (
                            <Badge tone="success">Current</Badge>
                          ) : null}
                        </InlineStack>

                        <Text as="p" tone="subdued">
                          {plan.audience}
                        </Text>

                        <BlockStack gap="050">
                          <Text as="p" variant="heading2xl">
                            {plan.priceLabel}
                          </Text>
                          <Text as="p" tone="subdued">
                            {plan.priceMetaLabel}
                          </Text>
                          <Text as="p" tone="subdued">
                            {plan.creditsPerMonth} credits
                            {plan.creditPriceLabel
                              ? ` · ${plan.creditPriceLabel}`
                              : ""}
                          </Text>
                        </BlockStack>

                        <Divider />

                        <ul
                          style={{
                            margin: 0,
                            paddingLeft: "1.25rem",
                            listStyleType: "disc",
                            display: "grid",
                            gap: "10px",
                          }}
                        >
                          {plan.features.map((feature) => (
                            <li key={feature}>
                              <Text as="span">{feature}</Text>
                            </li>
                          ))}
                        </ul>
                      </BlockStack>

                      {plan.slug === FREE_PLAN.slug ? (
                        <Form method="post" className="plan-card-cta">
                          <input type="hidden" name="intent" value="cancel" />
                          <Button
                            submit
                            fullWidth
                            variant={isCurrentPlan ? "primary" : "secondary"}
                            disabled={isCurrentPlan}
                            loading={submittingIntent === "cancel"}
                          >
                            {isCurrentPlan ? "Current plan" : "Cancel paid plan"}
                          </Button>
                        </Form>
                      ) : (
                        <Form method="post" className="plan-card-cta">
                          <input type="hidden" name="intent" value="subscribe" />
                          <input type="hidden" name="plan" value={plan.slug} />
                          <Button
                            submit
                            fullWidth
                            variant={isCurrentPlan ? "primary" : "secondary"}
                            disabled={isCurrentPlan}
                            loading={isSubmittingThisPlan}
                          >
                            {isCurrentPlan ? "Current plan" : plan.ctaLabel}
                          </Button>
                        </Form>
                      )}
                    </div>
                  </Box>
                </Card>
              );
            })}
          </div>
        </BlockStack>
      </BlockStack>
    </Page>
  );
}
