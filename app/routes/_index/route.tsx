import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

const featureCards = [
  {
    title: "Product Studio",
    body:
      "Generate polished product visuals, alternate angles, and marketplace-ready imagery without waiting on another shoot.",
  },
  {
    title: "Media Studio",
    body:
      "Turn one product shot into campaign creative for ads, launches, promos, and social content that actually looks on-brand.",
  },
  {
    title: "Library and Import",
    body:
      "Keep approved assets in one place, then push the winners into your store files when they are ready to ship.",
  },
];

const workflowSteps = [
  "Enter your shop domain and open the app inside admin.",
  "Connect your IMAI key once and keep generation tied to the store.",
  "Create visuals, review results, and import what you want to publish.",
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export const meta = () => {
  return [
    { title: "IMAI Commerce Studio" },
    {
      name: "description",
      content:
        "Generate product visuals, campaign media, and reusable creative assets for your store with IMAI.",
    },
  ];
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.page}>
      <div className={styles.backdrop} />
      <main className={styles.shell}>
        <section className={styles.hero}>
          <div className={styles.copy}>
            <p className={styles.kicker}>IMAI Commerce Studio</p>
            <h1 className={styles.heading}>
              AI visuals for stores that need to look ready before the samples
              even arrive.
            </h1>
            <p className={styles.text}>
              Create product images, campaign creative, and reusable media from
              one workspace built for fast-moving commerce teams.
            </p>

            <div className={styles.statRow}>
              <div className={styles.statCard}>
                <span className={styles.statValue}>Product</span>
                <span className={styles.statLabel}>studio workflows</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statValue}>Media</span>
                <span className={styles.statLabel}>campaign generation</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statValue}>Library</span>
                <span className={styles.statLabel}>asset reuse and import</span>
              </div>
            </div>
          </div>

          <aside className={styles.loginPanel}>
            <div className={styles.loginHeader}>
              <p className={styles.panelEyebrow}>Open your store workspace</p>
              <h2>Log in with your shop domain</h2>
              <p>
                Use your <code>.myshopify.com</code> address to launch the
                embedded app inside admin.
              </p>
            </div>

            {showForm && (
              <Form className={styles.form} method="post" action="/auth/login">
                <label className={styles.label} htmlFor="shop">
                  Shop domain
                </label>
                <input
                  className={styles.input}
                  id="shop"
                  type="text"
                  name="shop"
                  placeholder="your-store.myshopify.com"
                  autoComplete="on"
                  required
                />
                <button className={styles.button} type="submit">
                  Enter app
                </button>
                <p className={styles.hint}>
                  Example: <span>your-store.myshopify.com</span>
                </p>
              </Form>
            )}

            <ul className={styles.workflow}>
              {workflowSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
          </aside>
        </section>

        <section className={styles.gallerySection}>
          <div className={styles.galleryLead}>
            <p className={styles.sectionKicker}>What the workspace is for</p>
            <h2>One place for product visuals, launch assets, and store-ready media.</h2>
          </div>

          <div className={styles.galleryGrid}>
            <img
              className={`${styles.tile} ${styles.tileTall}`}
              src="/media/marketing.webp"
              alt="Campaign-style product creative generated with IMAI"
            />
            <img
              className={styles.tile}
              src="/product/productgen.webp"
              alt="Product image generation example"
            />
            <img
              className={styles.tile}
              src="/media/marketing2.webp"
              alt="Marketing concept generated in IMAI"
            />
            <img
              className={`${styles.tile} ${styles.tileWide}`}
              src="/product/productgen2.webp"
              alt="Store-ready product composition"
            />
          </div>
        </section>

        <section className={styles.features}>
          {featureCards.map((feature) => (
            <article className={styles.featureCard} key={feature.title}>
              <p className={styles.featureTitle}>{feature.title}</p>
              <p className={styles.featureBody}>{feature.body}</p>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
