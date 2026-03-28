import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";
import {
  ArrowRight,
  RefreshCcw,
  Smartphone,
  SquarePlus,
} from "lucide-react";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

const HERO_IMAGE_SRC = "/launch/store.webp";
const HERO_IMAGE_ALT =
  "Storefront mockup collage used as the launch page hero visual";
const COMPANY_LOGO_SRC = "/launch/logo.webp";

const featureItems = [
  {
    title: "Campaign Ready Visuals",
    Icon: Smartphone,
  },
  {
    title: "One Click Catalogue Generation",
    Icon: SquarePlus,
  },
  {
    title: "Sync Store With Studio",
    Icon: RefreshCcw,
  },
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
    { title: "Transform your Store | IMAI.STUDIO" },
    {
      name: "description",
      content:
        "Transform your store with campaign-ready visuals, catalogue generation, and studio sync powered by IMAI.",
    },
  ];
};

function ShopifyMark() {
  return (
    <svg
      aria-hidden="true"
      className={styles.shopifyMark}
      viewBox="0 0 64 72"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="8" y="11" width="48" height="53" rx="8" fill="#95BF47" />
      <path
        d="M23 17C23 10.3726 27.9249 5 34 5C40.0751 5 45 10.3726 45 17"
        stroke="#7AA93C"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M42.0754 24.2935C41.7437 24.0362 41.2726 23.8524 40.6532 23.7422L38.6498 39.9859C37.3243 40.6839 35.4246 41.033 32.9589 41.033C31.5912 41.033 30.4115 40.9044 29.4197 40.6472C28.4278 40.39 27.6315 40.041 27.0306 39.6002L28.1652 35.8516C28.9347 36.3659 29.7929 36.7526 30.7397 37.0116C31.6864 37.2707 32.6177 37.4002 33.5334 37.4002C34.2335 37.4002 34.7344 37.3194 35.0361 37.1578C35.3378 36.9962 35.4886 36.7281 35.4886 36.3536C35.4886 36.0384 35.3143 35.763 34.9653 35.5277C34.6163 35.2924 34.0442 35.0261 33.2498 34.7288C31.7056 34.1559 30.5603 33.4776 29.8138 32.694C29.0674 31.9104 28.6942 30.9334 28.6942 29.7631C28.6942 28.6956 28.9726 27.7554 29.5295 26.9424C30.0864 26.1294 30.8828 25.4989 31.9187 25.0508C32.9547 24.6027 34.1726 24.3787 35.5726 24.3787C36.7421 24.3787 37.8053 24.5092 38.7623 24.7701C39.7194 25.0311 40.5263 25.4055 41.1829 25.8935L42.0754 24.2935Z"
        fill="white"
      />
    </svg>
  );
}

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.page}>
      <main className={styles.shell}>
        <section className={styles.hero}>
          <div className={styles.visualPanel}>
            <img
              className={styles.heroImage}
              src={HERO_IMAGE_SRC}
              alt={HERO_IMAGE_ALT}
            />
          </div>

          <aside className={styles.contentPanel}>
            <div className={styles.brandCluster}>
              <div className={styles.shopifyCard}>
                <ShopifyMark />
              </div>
              <div
                className={styles.logoBadge}
                aria-label="IMAI Studio logo"
              >
                <img
                  className={styles.logoImage}
                  src={COMPANY_LOGO_SRC}
                  alt="IMAI Studio logo"
                />
              </div>
            </div>

            <div className={styles.copyBlock}>
              <h1 className={styles.heading}>Transform your Store</h1>
              <p className={styles.subtitle}>IMAI.STUDIO</p>
            </div>

            <ul className={styles.featureList}>
              {featureItems.map(({ title, Icon }) => (
                <li className={styles.featureItem} key={title}>
                  <span className={styles.iconWrap} aria-hidden="true">
                    <Icon size={22} strokeWidth={2.1} />
                  </span>
                  <span className={styles.featureText}>{title}</span>
                </li>
              ))}
            </ul>

            {showForm && (
              <Form className={styles.form} method="post" action="/auth/login">
                <label className={styles.srOnly} htmlFor="shop">
                  Shopify domain
                </label>
                <div className={styles.inputRow}>
                  <input
                    className={styles.input}
                    id="shop"
                    type="text"
                    name="shop"
                    placeholder="your-store.myshopify.com"
                    autoComplete="on"
                    required
                  />
                  <button
                    className={styles.button}
                    type="submit"
                    aria-label="Go to app"
                  >
                    <ArrowRight size={18} strokeWidth={2.4} />
                  </button>
                </div>
              </Form>
            )}
          </aside>
        </section>
      </main>
    </div>
  );
}
