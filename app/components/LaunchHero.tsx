import { Icon } from "@iconify/react";
import { RefreshCcw } from "lucide-react";
import { Form } from "react-router";

import styles from "./LaunchHero.module.css";

const HERO_IMAGE_SRC = "/launch/store.webp";
const HERO_IMAGE_ALT =
  "Storefront mockup collage used as the launch page hero visual";
const COMPANY_LOGO_SRC = "/launch/logo.webp";

const featureItems = [
  {
    title: "Campaign Ready Visuals",
    subtitle: "Media Agent",
    renderIcon: () => <Icon icon="bi:phone-fill" width={25} height={25} />,
  },
  {
    title: "One Click Catalogue Generation",
    subtitle: "Product Agent",
    renderIcon: () => (
      <Icon icon="fluent:collections-20-filled" width={25} height={25} />
    ),
  },
  {
    title: "Sync Store With Agents",
    subtitle: "Store-aware workflows",
    renderIcon: () => <RefreshCcw size={20} strokeWidth={2.1} />,
  },
];

type LaunchHeroProps = {
  showShopDomainForm: boolean;
};

function ShopifyMark() {
  return (
    <svg
      aria-hidden="true"
      className={styles.shopifyMark}
      viewBox="0 0 256 292"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="#95bf46"
        d="M223.774 57.34c-.201-1.46-1.48-2.268-2.537-2.357a19614 19614 0 0 0-23.383-1.743s-15.507-15.395-17.209-17.099c-1.703-1.703-5.029-1.185-6.32-.805c-.19.056-3.388 1.043-8.678 2.68c-5.18-14.906-14.322-28.604-30.405-28.604c-.444 0-.901.018-1.358.044C129.31 3.407 123.644.779 118.75.779c-37.465 0-55.364 46.835-60.976 70.635c-14.558 4.511-24.9 7.718-26.221 8.133c-8.126 2.549-8.383 2.805-9.45 10.462C21.3 95.806.038 260.235.038 260.235l165.678 31.042l89.77-19.42S223.973 58.8 223.775 57.34M156.49 40.848l-14.019 4.339c.005-.988.01-1.96.01-3.023c0-9.264-1.286-16.723-3.349-22.636c8.287 1.04 13.806 10.469 17.358 21.32m-27.638-19.483c2.304 5.773 3.802 14.058 3.802 25.238c0 .572-.005 1.095-.01 1.624c-9.117 2.824-19.024 5.89-28.953 8.966c5.575-21.516 16.025-31.908 25.161-35.828m-11.131-10.537c1.617 0 3.246.549 4.805 1.622c-12.007 5.65-24.877 19.88-30.312 48.297l-22.886 7.088C75.694 46.16 90.81 10.828 117.72 10.828"
      />
      <path
        fill="#5e8e3e"
        d="M221.237 54.983a19614 19614 0 0 0-23.383-1.743s-15.507-15.395-17.209-17.099c-.637-.634-1.496-.959-2.394-1.099l-12.527 256.233l89.762-19.418S223.972 58.8 223.774 57.34c-.201-1.46-1.48-2.268-2.537-2.357"
      />
      <path
        fill="#fff"
        d="m135.242 104.585l-11.069 32.926s-9.698-5.176-21.586-5.176c-17.428 0-18.305 10.937-18.305 13.693c0 15.038 39.2 20.8 39.2 56.024c0 27.713-17.577 45.558-41.277 45.558c-28.44 0-42.984-17.7-42.984-17.7l7.615-25.16s14.95 12.835 27.565 12.835c8.243 0 11.596-6.49 11.596-11.232c0-19.616-32.16-20.491-32.16-52.724c0-27.129 19.472-53.382 58.778-53.382c15.145 0 22.627 4.338 22.627 4.338"
      />
    </svg>
  );
}

function SparkIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
    >
      <path
        fill="currentColor"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.5"
        d="M3 12c6.268 0 9-2.637 9-9c0 6.363 2.713 9 9 9c-6.287 0-9 2.713-9 9c0-6.287-2.732-9-9-9Z"
      />
    </svg>
  );
}

export function LaunchHero({ showShopDomainForm }: LaunchHeroProps) {
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
              <div className={styles.logoBadge} aria-label="IMAI Studio logo">
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
              {featureItems.map(({ title, subtitle, renderIcon }) => (
                <li className={styles.featureItem} key={title}>
                  <span className={styles.iconWrap} aria-hidden="true">
                    {renderIcon()}
                  </span>
                  <span className={styles.featureCopy}>
                    <span className={styles.featureText}>{title}</span>
                    {subtitle ? (
                      <span className={styles.featureSubtext}>{subtitle}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>

            {showShopDomainForm ? (
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
                    <SparkIcon className={styles.buttonSparkIcon} />
                  </button>
                </div>
              </Form>
            ) : null}
          </aside>
        </section>
      </main>
    </div>
  );
}
