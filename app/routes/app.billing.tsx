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
  syncShopBillingState,
} from "../lib/billing.server";
import {
  ANNUAL_PLAN_CARDS,
  FREE_PLAN,
  MONTHLY_PLAN_CARDS,
  PAID_PLAN_NAMES,
  getPaidPlanBySlug,
  getPaidPlanByTierAndInterval,
} from "../lib/billing/plans";
import { authenticate } from "../shopify.server";
import { decrypt } from "../lib/encryption.server";

type BillingPlanCard = typeof FREE_PLAN | (typeof MONTHLY_PLAN_CARDS)[number] | (typeof ANNUAL_PLAN_CARDS)[number];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  let syncError: string | null = null;
  let syncedBilling;

  try {
    syncedBilling = await syncShopBillingState({
      shop: session.shop,
      billing,
    });
  } catch (error) {
    console.error("[Billing] Failed to sync Shopify billing state", {
      shop: session.shop,
      error,
    });

    syncError =
      "Billing state could not be synced right now. Please refresh or try again in a moment.";
    syncedBilling = {
      activePlan: FREE_PLAN,
      activeSubscription: null,
      creditAllocation: {
        state: "failed" as const,
        message: syncError,
      },
    };
  }

  const storedKey = await prisma.apiKey.findUnique({
    where: { shop: session.shop },
    select: { maskedKey: true, encryptedKey: true },
  });
  let displayCurrentPlanSlug: string | null = null;

  if (storedKey) {
    try {
      const apiKey = decrypt(storedKey.encryptedKey);
      const creditsResp = await fetch("https://www.imai.studio/api/v1/credits", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (creditsResp.ok) {
        const creditsData = (await creditsResp.json()) as {
          plan?: string | null;
          billingCycle?: string | null;
        };
        const displayPlan = getPaidPlanByTierAndInterval(
          creditsData.plan,
          creditsData.billingCycle,
        );

        displayCurrentPlanSlug = displayPlan?.slug ?? null;
      }
    } catch (error) {
      console.error("[Billing] Failed to fetch IMAI plan for display", {
        shop: session.shop,
        error,
      });
    }
  }

  return {
    shop: session.shop,
    monthlyPlans: MONTHLY_PLAN_CARDS,
    annualPlans: ANNUAL_PLAN_CARDS,
    isImaiConnected: !!storedKey,
    billingTestMode: BILLING_TEST_MODE,
    shopifyCurrentPlanSlug: syncedBilling.activePlan.slug,
    displayCurrentPlanSlug,
    creditAllocation: syncedBilling.creditAllocation,
    syncError,
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
    shopifyCurrentPlanSlug,
    displayCurrentPlanSlug,
    creditAllocation,
    syncError,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();

  const submittingIntent = navigation.formData?.get("intent");
  const submittingPlan = navigation.formData?.get("plan");

  const renderPlanCard = (plan: BillingPlanCard) => {
    const isShopifyCurrentPlan = shopifyCurrentPlanSlug === plan.slug;
    const isDisplayCurrentPlan = displayCurrentPlanSlug === plan.slug;
    const isSubmittingThisPlan =
      submittingIntent === "subscribe" && submittingPlan === plan.slug;
    const features = plan.features
      .map((feature) => feature.trim())
      .filter((feature) => feature.length > 0);

    return (
      <Card key={plan.slug} padding="400">
        <BlockStack gap="400">
          <InlineStack align="space-between" blockAlign="center">
            <Text as="h2" variant="headingLg">
              {plan.name}
            </Text>
            {isDisplayCurrentPlan ? <Badge tone="success">Current</Badge> : null}
          </InlineStack>

          <BlockStack gap="200">
            <Text as="p" variant="bodyMd" tone="subdued">
              {plan.audience}
            </Text>

            <BlockStack gap="100">
              <Text as="p" variant="headingLg">
                {plan.priceLabel}
              </Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                {plan.priceMetaLabel}
              </Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                {plan.creditsPerMonth} credits
                {plan.creditPriceLabel ? ` · ${plan.creditPriceLabel}` : ""}
              </Text>
            </BlockStack>
          </BlockStack>

          <Divider />

          <BlockStack gap="200">
            {features.map((feature) => (
              <InlineStack
                key={feature}
                gap="200"
                blockAlign="start"
                wrap={false}
              >
                <Text as="span" tone="subdued" fontWeight="bold">
                  •
                </Text>
                <Text as="p" variant="bodyMd">
                  {feature}
                </Text>
              </InlineStack>
            ))}
          </BlockStack>

          <Box paddingBlockStart="300">
            {plan.slug === FREE_PLAN.slug ? (
              <Form method="post">
                <input type="hidden" name="intent" value="cancel" />
                <Button
                  submit
                  fullWidth
                  variant={isShopifyCurrentPlan ? "primary" : "secondary"}
                  disabled={isShopifyCurrentPlan}
                  loading={submittingIntent === "cancel"}
                >
                  {isShopifyCurrentPlan ? "Current plan" : "Cancel paid plan"}
                </Button>
              </Form>
            ) : (
              <Form method="post">
                <input type="hidden" name="intent" value="subscribe" />
                <input type="hidden" name="plan" value={plan.slug} />
                <Button
                  submit
                  fullWidth
                  variant={isShopifyCurrentPlan ? "primary" : "secondary"}
                  disabled={isShopifyCurrentPlan}
                  loading={isSubmittingThisPlan}
                >
                  {isShopifyCurrentPlan ? "Current plan" : plan.ctaLabel}
                </Button>
              </Form>
            )}
          </Box>
        </BlockStack>
      </Card>
    );
  };

  return (
    <Page title="Billing">
      <style>{`
        @media (max-width: 960px) {
          .billing-grid {
            grid-template-columns: 1fr !important;
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

        {syncError ? (
          <Banner tone="critical" title="Billing data is temporarily unavailable">
            {syncError}
          </Banner>
        ) : null}

        {!isImaiConnected && shopifyCurrentPlanSlug !== FREE_PLAN.slug ? (
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
        <Box paddingInlineStart="400" paddingInlineEnd="400">
          <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
            <BlockStack gap="500">
              <BlockStack gap="300">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingXl">
                    Monthly billing
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Pay month to month and keep the same monthly credit grants.
                  </Text>
                </BlockStack>

                <div
                  className="billing-grid"
                  style={{
                    display: "grid",
                    gap: "24px",
                    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                    alignItems: "stretch",
                  }}
                >
                  {[
                    FREE_PLAN,
                    ...monthlyPlans,
                  ].map((plan) => renderPlanCard(plan))}
                </div>
              </BlockStack>

              <Box paddingBlockEnd="800">
                <BlockStack gap="300">
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingXl">
                      Annual billing
                    </Text>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      Billed upfront for the year. Monthly credit grants stay the
                      same.
                    </Text>
                  </BlockStack>

                  <div
                    className="billing-grid"
                    style={{
                      display: "grid",
                      gap: "24px",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(280px, 1fr))",
                      alignItems: "stretch",
                    }}
                  >
                    {annualPlans.map((plan) => renderPlanCard(plan))}
                  </div>
                </BlockStack>
              </Box>
            </BlockStack>
          </div>
        </Box>
      </BlockStack>
    </Page>
  );
}
