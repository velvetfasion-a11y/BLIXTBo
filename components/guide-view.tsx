import Link from "next/link";
import { Wordmark } from "@/components/mark";
import { SiteFooter } from "@/components/site-footer";
import {
  GUIDE_DISCLAIMER,
  GUIDE_UPDATED,
  GUIDE_UPDATED_LABEL,
  guideBySlug,
  guideHref,
  guides,
  paragraphParts,
  type Guide,
  type TextPart,
} from "@/lib/guides";

function RichText({ parts }: { parts: TextPart[] }) {
  return parts.map((part, index) => {
    if (typeof part === "string") return <span key={index}>{part}</span>;
    if (part.href.startsWith("http")) {
      return (
        <a key={index} href={part.href} className="font-medium text-pine underline decoration-pine/30 underline-offset-2" target="_blank" rel="noopener noreferrer">
          {part.label}
          <span className="sr-only"> (öppnas i ny flik)</span>
        </a>
      );
    }
    return (
      <Link key={index} href={part.href} className="font-medium text-pine underline decoration-pine/30 underline-offset-2">
        {part.label}
      </Link>
    );
  });
}

export function GuideChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-paper">
      <div className="mx-auto w-full max-w-xl px-5 py-8 md:px-8 md:py-12">
        <Wordmark />
        {children}
      </div>
      <SiteFooter />
    </div>
  );
}

export function GuideIndex() {
  return (
    <>
      <p className="mt-8 text-sm font-medium text-pine">Guider</p>
      <h1 className="mt-2 font-serif text-4xl tracking-[-0.03em]">Guider om att hyra bostad</h1>
      <p className="mt-3 text-sm leading-relaxed text-soft">
        Praktiska steg när du söker hyresrätt: inkomst, personbevis, vad hyresvärden brukar kräva, borgen, dokument, betalningsanmärkning, köerna i Stockholm och hur du undviker bedrägerier.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-soft">
        Texterna är allmän information, inte juridisk rådgivning. Blixtbo äger inga lägenheter och garanterar inget kontrakt.
      </p>
      <p className="mt-3 text-sm text-soft">
        Senast uppdaterad <time dateTime={GUIDE_UPDATED}>{GUIDE_UPDATED_LABEL}</time>
      </p>
      <div className="mt-4 flex flex-wrap gap-4 text-sm font-medium">
        <Link href="/" className="text-pine">
          Till start
        </Link>
        <Link href="/hjalp" className="text-pine">
          Hjälp
        </Link>
      </div>
      <ul className="mt-10 divide-y divide-line border-y border-line">
        {guides.map((guide) => (
          <li key={guide.slug}>
            <Link href={guideHref(guide.slug)} className="block py-5">
              <span className="block text-base font-medium text-ink">{guide.title}</span>
              <span className="mt-2 block text-sm leading-relaxed text-soft">{guide.dek}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

export function GuideArticle({ guide }: { guide: Guide }) {
  const related = guide.related.map((slug) => guideBySlug(slug)).filter((item): item is Guide => item !== null);

  return (
    <article>
      <p className="mt-8 text-sm font-medium text-pine">
        <Link href="/guider" className="text-pine">
          Guider
        </Link>
      </p>
      <h1 className="mt-2 font-serif text-4xl tracking-[-0.03em]">{guide.title}</h1>
      <p className="mt-3 text-sm text-soft">
        Senast uppdaterad <time dateTime={GUIDE_UPDATED}>{GUIDE_UPDATED_LABEL}</time>
      </p>
      <div className="mt-4 flex flex-wrap gap-4 text-sm font-medium">
        <Link href="/guider" className="text-pine">
          Alla guider
        </Link>
        <Link href="/hjalp" className="text-pine">
          Hjälp
        </Link>
        <Link href="/" className="text-pine">
          Till start
        </Link>
      </div>

      <section className="mt-8 rounded-3xl bg-paper-deep px-4 py-4" aria-labelledby="sammanfattning">
        <h2 id="sammanfattning" className="text-sm font-medium">
          Sammanfattning
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-soft">{guide.summary}</p>
      </section>

      {guide.sections.map((section) => (
        <section key={section.heading} className="mt-10">
          <h2 className="font-serif text-2xl tracking-[-0.03em]">{section.heading}</h2>
          <div className="mt-4 space-y-4 text-sm leading-relaxed text-soft">
            {section.paragraphs.map((paragraph, index) => (
              <p key={index}>
                <RichText parts={paragraphParts(paragraph)} />
              </p>
            ))}
          </div>
          {section.bullets ? (
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-soft">
              {section.bullets.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}

      <section className="mt-10" aria-labelledby="sa-gor-du">
        <h2 id="sa-gor-du" className="font-serif text-2xl tracking-[-0.03em]">
          Så gör du
        </h2>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-soft">
          {guide.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <aside className="mt-10 rounded-3xl border border-line bg-card px-4 py-4">
        <h2 className="font-serif text-2xl tracking-[-0.03em]">Bevaka lediga lägenheter</h2>
        <p className="mt-3 text-sm leading-relaxed text-soft">{guide.cta}</p>
        <Link href="/" className="mt-4 inline-block text-sm font-medium text-pine">
          Till Blixtbo
        </Link>
      </aside>

      {related.length > 0 ? (
        <section className="mt-10" aria-labelledby="las-ocksa">
          <h2 id="las-ocksa" className="font-serif text-2xl tracking-[-0.03em]">
            Läs också
          </h2>
          <ul className="mt-4 space-y-3 text-sm">
            {related.map((item) => (
              <li key={item.slug}>
                <Link href={guideHref(item.slug)} className="font-medium text-pine">
                  {item.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="mt-10 text-sm leading-relaxed text-soft">{GUIDE_DISCLAIMER}</p>

      <section className="mt-10" aria-labelledby="kallor">
        <h2 id="kallor" className="font-serif text-2xl tracking-[-0.03em]">
          Källor
        </h2>
        <ul className="mt-4 space-y-3 text-sm leading-relaxed">
          {guide.sources.map((source) => (
            <li key={source.url}>
              <a href={source.url} className="font-medium text-pine underline decoration-pine/30 underline-offset-2" target="_blank" rel="noopener noreferrer">
                {source.name}
                <span className="sr-only"> (öppnas i ny flik)</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
