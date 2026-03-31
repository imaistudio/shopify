import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useActionData, useLoaderData } from "react-router";
import { Banner, BlockStack, Page, Text } from "@shopify/polaris";

import { login } from "../../shopify.server";
import { loginErrorMessage } from "./error.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const errors = loginErrorMessage(await login(request));

  return { errors };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const errors = loginErrorMessage(await login(request));

  return {
    errors,
  };
};

export default function Auth() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { errors } = actionData || loaderData;
  const message =
    errors.shop ??
    "Open IMAI.Studio from Shopify Admin or the app install screen to continue.";

  return (
    <Page title="Open from Shopify Admin">
      <BlockStack gap="400">
        <Banner tone="info" title="Start this app from Shopify">
          <Text as="p">{message}</Text>
        </Banner>
      </BlockStack>
    </Page>
  );
}
