export type BillingIntervalView = "monthly" | "annual";

export const FREE_PLAN = {
  slug: "free",
  name: "Free",
  nameWithInterval: "Free",
  audience: "Start with free credits to try IMAI.",
  priceAmount: 0,
  priceLabel: "$0",
  priceMetaLabel: "No Shopify subscription required",
  creditsPerMonth: 10,
  creditPriceLabel: null,
  ctaLabel: "Stay on Free",
  billingInterval: "monthly" as BillingIntervalView,
  features: [
    "10 free credits on signup",
    "Enough for ~10 Design or 25 Marketing images",
    "4K resolution",
  ],
} as const;

export const STARTER_MONTHLY_PLAN = "IMAI Starter Monthly" as const;
export const STARTER_ANNUAL_PLAN = "IMAI Starter Annual" as const;
export const PRO_MONTHLY_PLAN = "IMAI Pro Monthly" as const;
export const PRO_ANNUAL_PLAN = "IMAI Pro Annual" as const;
export const ULTRA_MONTHLY_PLAN = "IMAI Ultra Monthly" as const;
export const ULTRA_ANNUAL_PLAN = "IMAI Ultra Annual" as const;

export const PAID_PLANS = [
  {
    slug: "starter-monthly",
    billingName: STARTER_MONTHLY_PLAN,
    tierSlug: "starter",
    name: "Starter",
    nameWithInterval: "Starter Monthly",
    audience: "For individuals and small teams",
    billingInterval: "monthly" as BillingIntervalView,
    priceAmount: 20,
    priceLabel: "$20/month",
    priceMetaLabel: "Billed every 30 days",
    creditsPerMonth: 20,
    creditPriceLabel: "$1.00/credit",
    ctaLabel: "Choose Starter",
    features: [
      "20 credits per month",
      "Enough for ~20 Marketing or 50 Design images",
      "4K resolution",
    ],
  },
  {
    slug: "starter-annual",
    billingName: STARTER_ANNUAL_PLAN,
    tierSlug: "starter",
    name: "Starter",
    nameWithInterval: "Starter Annual",
    audience: "For individuals and small teams",
    billingInterval: "annual" as BillingIntervalView,
    priceAmount: 240,
    priceLabel: "$240/year",
    priceMetaLabel: "$20/month billed annually",
    creditsPerMonth: 20,
    creditPriceLabel: "$1.00/credit",
    ctaLabel: "Choose Starter Annual",
    features: [
      "20 credits added each month",
      "Enough for ~20 Marketing or 50 Design images per month",
      "4K resolution",
    ],
  },
  {
    slug: "pro-monthly",
    billingName: PRO_MONTHLY_PLAN,
    tierSlug: "pro",
    name: "Pro",
    nameWithInterval: "Pro Monthly",
    audience: "For growing teams",
    billingInterval: "monthly" as BillingIntervalView,
    priceAmount: 100,
    priceLabel: "$100/month",
    priceMetaLabel: "Billed every 30 days",
    creditsPerMonth: 110,
    creditPriceLabel: "$0.90/credit",
    ctaLabel: "Choose Pro",
    features: [
      "110 credits per month",
      "Enough for ~110 Marketing or 275 Design images",
      "4K resolution",
    ],
  },
  {
    slug: "pro-annual",
    billingName: PRO_ANNUAL_PLAN,
    tierSlug: "pro",
    name: "Pro",
    nameWithInterval: "Pro Annual",
    audience: "For growing teams",
    billingInterval: "annual" as BillingIntervalView,
    priceAmount: 1200,
    priceLabel: "$1,200/year",
    priceMetaLabel: "$100/month billed annually",
    creditsPerMonth: 110,
    creditPriceLabel: "$0.90/credit",
    ctaLabel: "Choose Pro Annual",
    features: [
      "110 credits added each month",
      "Enough for ~110 Marketing or 275 Design images per month",
      "4K resolution",
    ],
  },
  {
    slug: "ultra-monthly",
    billingName: ULTRA_MONTHLY_PLAN,
    tierSlug: "ultra",
    name: "Ultra",
    nameWithInterval: "Ultra Monthly",
    audience: "For power users",
    billingInterval: "monthly" as BillingIntervalView,
    priceAmount: 200,
    priceLabel: "$200/month",
    priceMetaLabel: "Billed every 30 days",
    creditsPerMonth: 250,
    creditPriceLabel: "$0.80/credit",
    ctaLabel: "Choose Ultra",
    features: [
      "250 credits per month",
      "Enough for ~250 Marketing or 625 Design images",
      "4K resolution",
    ],
  },
  {
    slug: "ultra-annual",
    billingName: ULTRA_ANNUAL_PLAN,
    tierSlug: "ultra",
    name: "Ultra",
    nameWithInterval: "Ultra Annual",
    audience: "For power users",
    billingInterval: "annual" as BillingIntervalView,
    priceAmount: 2400,
    priceLabel: "$2,400/year",
    priceMetaLabel: "$200/month billed annually",
    creditsPerMonth: 250,
    creditPriceLabel: "$0.80/credit",
    ctaLabel: "Choose Ultra Annual",
    features: [
      "250 credits added each month",
      "Enough for ~250 Marketing or 625 Design images per month",
      "4K resolution",
    ],
  },
] as const;

export type PaidPlan = (typeof PAID_PLANS)[number];
export type PaidPlanSlug = PaidPlan["slug"];
export type PaidPlanInterval = PaidPlan["billingInterval"];
export type PaidBillingPlanName = PaidPlan["billingName"];

export const PAID_PLAN_NAMES = PAID_PLANS.map(
  (plan) => plan.billingName,
) as PaidBillingPlanName[];

export const MONTHLY_PLAN_CARDS = PAID_PLANS.filter(
  (plan) => plan.billingInterval === "monthly",
) as Extract<PaidPlan, { billingInterval: "monthly" }>[];

export const ANNUAL_PLAN_CARDS = PAID_PLANS.filter(
  (plan) => plan.billingInterval === "annual",
) as Extract<PaidPlan, { billingInterval: "annual" }>[];

export function getPaidPlanBySlug(slug: string | null | undefined) {
  return PAID_PLANS.find((plan) => plan.slug === slug) ?? null;
}

export function getPaidPlanByBillingName(name: string | null | undefined) {
  return PAID_PLANS.find((plan) => plan.billingName === name) ?? null;
}

export function getDefaultPlanView(
  interval: BillingIntervalView | null | undefined,
) {
  return interval === "annual" ? "annual" : "monthly";
}
