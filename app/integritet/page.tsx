import type { Metadata } from "next";
import { Privacy } from "@/components/privacy";

const description = "Integritetspolicy för Blixtbo: vilka uppgifter vi sparar, varför, hur länge, och hur du raderar dem.";

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
