import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { Landing } from "@/components/landing";
import { LandingSignIn } from "@/components/landing-sign-in";
import { SignedInRedirect } from "@/components/landing-notice";
import { HOME_DESCRIPTION, HOME_TITLE, faqJsonLd, homeFaqs, webApplicationJsonLd } from "@/lib/seo";

export const metadata: Metadata = {
  title: { absolute: HOME_TITLE },
  description: HOME_DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "sv_SE",
    siteName: "Blixtbo",
    url: "/",
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
  },
};

export default function Page() {
  const faqs = homeFaqs();
  return (
    <>
      <JsonLd data={webApplicationJsonLd()} />
      <JsonLd data={faqJsonLd(faqs)} />
      <SignedInRedirect />
      <Landing signIn={<LandingSignIn />} />
    </>
  );
}
