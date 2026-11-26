import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { Help } from "@/components/help";
import { faqJsonLd, homeFaqs } from "@/lib/seo";

const description = "Så fungerar Blixtbo, betalning, avslut och radering av uppgifter.";

export const metadata: Metadata = {
  title: "Hjälp",
  description,
  alternates: { canonical: "/hjalp" },
  openGraph: {
    type: "website",
    locale: "sv_SE",
    siteName: "Blixtbo",
    url: "/hjalp",
    title: "Hjälp | Blixtbo",
    description,
  },
  twitter: {
    card: "summary_large_image",
    title: "Hjälp | Blixtbo",
    description,
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={faqJsonLd(homeFaqs())} />
      <Help />
    </>
  );
}
