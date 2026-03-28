'use client';

import { LaunchHero } from "../components/LaunchHero";

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

export default function App() {
  return <LaunchHero showShopDomainForm={false} />;
}
