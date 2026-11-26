import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/json-ld";
import { GuideArticle, GuideChrome } from "@/components/guide-view";
import { guideArticleJsonLd, guideBreadcrumbJsonLd, guideBySlug, guideMetadata, guides } from "@/lib/guides";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return guides.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const guide = guideBySlug(slug);
  if (!guide) return { title: "Guide" };
  return guideMetadata(guide);
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = guideBySlug(slug);
  if (!guide) notFound();

  return (
    <>
      <JsonLd data={guideArticleJsonLd(guide)} />
      <JsonLd data={guideBreadcrumbJsonLd(guide)} />
      <GuideChrome>
        <GuideArticle guide={guide} />
      </GuideChrome>
    </>
  );
}
