import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { GuideChrome, GuideIndex } from "@/components/guide-view";
import { guidesIndexJsonLd, guidesIndexMetadata } from "@/lib/guides";

export const dynamic = "force-static";

export const metadata: Metadata = guidesIndexMetadata();

export default function Page() {
  return (
    <>
      <JsonLd data={guidesIndexJsonLd()} />
      <GuideChrome>
        <GuideIndex />
      </GuideChrome>
    </>
  );
}
