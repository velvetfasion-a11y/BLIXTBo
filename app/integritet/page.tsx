import type { Metadata } from "next";
import { Privacy } from "@/components/privacy";

const description = "Så hanterar Blixtbo uppgifter, recensioner och radering av konto.";

export const metadata: Metadata = {
  title: "Integritet",
  description,
  alternates: { canonical: "/integritet" },
  openGraph: {
    type: "website",
    locale: "sv_SE",
    siteName: "Blixtbo",
    url: "/integritet",
    title: "Integritet | Blixtbo",
    description,
  },
  twitter: {
    card: "summary_large_image",
    title: "Integritet | Blixtbo",
    description,
  },
};

export default function Page() {
  return <Privacy />;
}
