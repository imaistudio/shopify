import type { LoaderFunctionArgs } from "react-router";
import { redirect, useLoaderData } from "react-router";

import { LaunchHero } from "../../components/LaunchHero";
import { login } from "../../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export const meta = () => {
  return [
    { title: "Transform your Store | IMAI.STUDIO" },
    {
      name: "description",
      content:
        "Transform your store with campaign-ready visuals, catalogue generation, and agent-powered workflows from IMAI.",
    },
  ];
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return <LaunchHero showShopDomainForm={showForm} />;
}
