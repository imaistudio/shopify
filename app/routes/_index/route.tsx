import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect, useActionData, useLoaderData, useNavigation } from "react-router";

import { LaunchHero } from "../../components/LaunchHero";

function normalizeShopDomain(value: string) {
  const trimmedValue = value.trim().toLowerCase();
  if (!trimmedValue) return null;

  const candidateValue = trimmedValue.includes("://")
    ? trimmedValue
    : `https://${trimmedValue}`;

  let hostname: string;
  try {
    hostname = new URL(candidateValue).hostname.toLowerCase();
  } catch {
    return null;
  }

  const normalizedHostname = hostname.replace(/\.+$/, "");
  const myshopifySuffix = ".myshopify.com";
  const fullShopDomain = normalizedHostname.includes(".")
    ? normalizedHostname
    : `${normalizedHostname}${myshopifySuffix}`;

  if (!fullShopDomain.endsWith(myshopifySuffix)) {
    return null;
  }

  const storeName = fullShopDomain.slice(0, -myshopifySuffix.length);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(storeName)) {
    return null;
  }

  return `${storeName}${myshopifySuffix}`;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const rawShopValue = String(formData.get("shop") ?? "");
  const normalizedShopDomain = normalizeShopDomain(rawShopValue);

  if (!normalizedShopDomain) {
    return {
      error:
        "Enter your Shopify store name or full myshopify.com domain, for example `your-store` or `your-store.myshopify.com`.",
      shop: rawShopValue,
    };
  }

  throw redirect(`/auth/login?shop=${encodeURIComponent(normalizedShopDomain)}`);
};

export const meta = () => {
  return [
    { title: "Transform your Store | IMAI.Studio" },
    {
      name: "description",
      content:
        "Transform your store with campaign-ready visuals, catalogue generation, and agent-powered workflows from IMAI.",
    },
  ];
};

export default function App() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  useLoaderData<typeof loader>();

  return (
    <LaunchHero
      installError={actionData?.error ?? null}
      initialShopValue={actionData?.shop ?? ""}
      isSubmitting={navigation.state === "submitting"}
    />
  );
}
