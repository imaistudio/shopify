import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Divider,
} from "@shopify/polaris";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return {};
};

function FeatureBlock({
  title,
  description,
  image,
  reverse = false,
}: {
  title: string;
  description: string;
  image: string;
  reverse?: boolean;
}) {
  return (
    <Card>
      <InlineStack
        gap="600"
        align="center"
        wrap={false}
        direction={reverse ? "row-reverse" : "row"}
      >
        {/* Image */}
        <div style={{ flex: 1 }}>
          <img
            src={image}
            alt={title}
            style={{
              width: "100%",
              borderRadius: "12px",
              objectFit: "cover",
            }}
          />
        </div>

        {/* Text */}
        <div style={{ flex: 1 }}>
          <BlockStack gap="400">
            <Text variant="headingLg" as="h2">
              {title}
            </Text>
            <Text variant="bodyMd" as="p" tone="subdued">
              {description}
            </Text>
          </BlockStack>
        </div>
      </InlineStack>
    </Card>
  );
}

export default function ExploreIMAI() {
  return (
    <Page title="Explore">
      <Layout>
        {/* Hero */}
        <Layout.Section>
          <BlockStack gap="200">
            <Text variant="heading2xl" as="h1" alignment="start">
              Physical Product Creation Agents
            </Text>
            <Text variant="headingLg" as="p" alignment="start" tone="subdued">
              That Learn Brand-Specific Design, Technical & Marketing Skills
            </Text>
            <Text variant="bodySm" as="p" alignment="start" tone="subdued">
              And Generate Collection Designs, Product Variations, Techpacks, and Campaign-Ready Visuals
            </Text>
          </BlockStack>
        </Layout.Section>

        <Layout.Section>
          <Divider />
        </Layout.Section>

        {/* 1️⃣ Sketch to Photorealistic */}
        <Layout.Section>
          <FeatureBlock
            title="1. Sketch → Photorealistic Product"
            image="https://assets.imai.studio/global/image/8aeae9f1-c29d-46da-9233-51b03ff6aab0.png"
            description={`Upload a rough product sketch. 
Select a design style (optional). 
Generate high-quality photorealistic renders instantly.

Perfect for footwear, apparel, accessories, and concept products.`}
          />
        </Layout.Section>

        {/* 2️⃣ Design Aesthetics + Garment Editing */}
        <Layout.Section>
          <FeatureBlock
            reverse
            title="2. Apply Aesthetics to Anything"
            image="https://assets.imai.studio/global/image/24aaf55f-0479-432b-a502-20abb98b395d.png"
            description={`Select multiple design aesthetics like Minimal, Edgy, Animal Print, or Luxury.

IMAI intelligently applies the style directly to your garment structure — 
adjusting fabric, pattern, silhouette, and detailing automatically.`}
          />
        </Layout.Section>

        {/* 3️⃣ Technical Blueprints + FOB */}
        <Layout.Section>
          <FeatureBlock
            title="3. Technical Blueprints & FOB Costing"
            image="https://assets.imai.studio/global/image/af7f9d20-7b12-4a3e-a025-601a35e9b1b2.webp"
            description={`Generate technical breakdowns instantly.

Compare FOB across China, Vietnam, Indonesia, Italy.
Get material, labor, overhead and margin insights.
Export detailed reports for sourcing teams.`}
          />
        </Layout.Section>

        {/* 4️⃣ Lifestyle & Social Generation */}
        <Layout.Section>
          <FeatureBlock
            reverse
            title="4. Lifestyle & Social Media Generation"
            image="https://assets.imai.studio/global/image/a4c8b986-0d62-4fb1-a5fe-40613a12a15c.png"
            description={`Select up to 5 avatars to guide content generation.

Create premium lifestyle images ready for:
• Instagram
• Shopify banners
• Ads
• Product campaigns

No photoshoots required.`}
          />
        </Layout.Section>

        {/* 5️⃣ Pattern Generation */}
        <Layout.Section>
          <FeatureBlock
            title="5. Layered Pattern & Print Files"
            image="https://assets.imai.studio/global/image/660334a0-63ee-40a7-9a01-eb7d2a10d977.jpg"
            description={`Upload product reference.
Preview layered pattern blowups.
Generate repeatable high-resolution print files for production.

Export scalable printer-ready assets instantly.`}
          />
        </Layout.Section>

        {/* CTA Section */}
        <Layout.Section>
          <Divider />
        </Layout.Section>

    
      </Layout>
    </Page>
  );
}
