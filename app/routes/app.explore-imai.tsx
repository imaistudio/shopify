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
import styles from "../components/ExploreHero.module.css";

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
    <Page>
      <Layout>
        {/* Hero */}
        <Layout.Section>
          <section className={styles.hero}>
            <p className={styles.eyebrow}>Purpose Built</p>
            <h1 className={styles.heroTitle}>
              <span>Physical Product Creation</span>
              <span>Agents</span>
            </h1>
            <p className={styles.heroSubtitle}>
              <span>That Learn Brand-Specific Design, Technical &amp;</span>
              <span>Marketing Skills</span>
            </p>
            <p className={styles.heroCaption}>
              And Generate Collection Designs, Product Variations, Techpacks,
              and Campaign-Ready Visuals
            </p>
          </section>
        </Layout.Section>

        <Layout.Section>
          <Divider />
        </Layout.Section>

        <Layout.Section>
          <FeatureBlock
            title="Create Product Render Concepts"
            image="https://assets.imai.studio/global/image/8aeae9f1-c29d-46da-9233-51b03ff6aab0.png"
            description={`Upload a rough product sketch. 
Select a design style (optional). 
Generate product render concepts for review and iteration.

Useful for footwear, apparel, accessories, and concept products.`}
          />
        </Layout.Section>




        <Layout.Section>
          <FeatureBlock
            reverse
            title="Color Variation Generation"
            image="https://www.imai.studio/_next/image?url=https%3A%2F%2Fassets.imai.studio%2Fglobal%2Fimage%2Fc642d575-f5fd-4884-ba0a-6547ebe086bf.png&w=3840&q=75"
            description={`Turn one design into multiple color directions.
Generate colorways, explore palettes, and refine your product's look without starting over.
Built for fast iteration across footwear, apparel, accessories, and more.`}
          />
        </Layout.Section>





        <Layout.Section>
          <FeatureBlock
            title="Trend Research Support"
            image="https://www.imai.studio/_next/image?url=https%3A%2F%2Fassets.imai.studio%2Fglobal%2Fimage%2Fd59e4fa9-7f25-4782-bba6-238841f212b3.png&w=3840&q=75"
            description={`Review style, color, and design-direction inputs for product ideation.
Use trend research as supporting context while planning new product visuals.
Useful for fast-moving fashion and product teams.`}
          />
        </Layout.Section>




        <Layout.Section>
          <FeatureBlock
            reverse
            title="Customized Graphic Patterns"
            image="https://www.imai.studio/_next/image?url=https%3A%2F%2Fassets.imai.studio%2Fglobal%2Fimage%2F24aaf55f-0479-432b-a502-20abb98b395d.png&w=3840&q=75"
            description={`Create unique graphic patterns tailored to your design.
Generate prints, textures, and surface graphics customized to your product, style, and brand identity.
Useful for apparel, footwear, and accessories.`}
          />
        </Layout.Section>




        {/* 4️⃣ Lifestyle & Social Generation */}
        <Layout.Section>
          <FeatureBlock
            
            title="Technical Blueprint"
            image="https://www.imai.studio/_next/image?url=https%3A%2F%2Fassets.imai.studio%2Fglobal%2Fimage%2Faf7f9d20-7b12-4a3e-a025-601a35e9b1b2.webp&w=3840&q=75"
            description={`Generate detailed technical blueprints for your designs.

Create draft specifications including construction details, measurements, materials, and components for review.`}
          />
        </Layout.Section>

        {/* 5️⃣ Pattern Generation */}
        <Layout.Section>
          <FeatureBlock
          reverse
            title="Extract Graphic Patterns"
            image="https://www.imai.studio/_next/image?url=https%3A%2F%2Fassets.imai.studio%2Fglobal%2Fimage%2F660334a0-63ee-40a7-9a01-eb7d2a10d977.jpg&w=3840&q=75"
            description={`Upload a product or reference image.
Extract and isolate graphic patterns, preview detailed pattern blowups, and generate repeat-file concepts.
Export high-resolution assets for merchant review.`}
          />
        </Layout.Section>



        <Layout.Section>
          <FeatureBlock
            title="Cost Estimate Support"
            image="https://www.imai.studio/_next/image?url=https%3A%2F%2Fassets.imai.studio%2Fglobal%2Fimage%2F89b47bea-9107-4818-9727-3662fef67636.png&w=3840&q=75"
            description={`Create a draft cost estimate for your product.
Review materials, labor, overhead, and margin inputs while planning product concepts.`}
          />
        </Layout.Section>

        <Layout.Section>
          <FeatureBlock
            reverse
            title="Avatars"
            image="https://www.imai.studio/_next/image?url=https%3A%2F%2Fassets.imai.studio%2Fglobal%2Fimage%2F3106e1b7-e040-4f3d-a313-c9c3afaee956.png&w=3840&q=75"
            description={`Create consistent brand avatars for your campaigns.
              Generate models that match your brand direction and reuse them across ads, social media, and product visuals.`}
          />
        </Layout.Section>


        <Layout.Section>
          <FeatureBlock
            title="Videos & UGC"
            image="https://www.imai.studio/_next/image?url=https%3A%2F%2Fassets.imai.studio%2Fglobal%2Fimage%2Fa4c8b986-0d62-4fb1-a5fe-40613a12a15c.png&w=3840&q=75"
            description={`Create product videos and UGC with your brand avatars.
Generate campaign content for ads, social media, and product launches.`}
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
