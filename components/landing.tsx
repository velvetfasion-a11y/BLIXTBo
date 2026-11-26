import { FaqList } from "@/components/faq-list";
import { LandingNotice } from "@/components/landing-notice";
import { LandlordLogoCloud } from "@/components/landlord-logo-cloud";
import { Wordmark } from "@/components/mark";
import { SiteFooter } from "@/components/site-footer";
import { asset } from "@/lib/asset";
import { HOME_H1, HOME_SECTIONS, HOME_STEPS, HOME_SUBLINE, includedCopy } from "@/lib/seo";

export function Landing({ signIn }: { signIn: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-paper">
      <main>
      <div className="grid lg:min-h-[760px] lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)]">
        <div className="flex flex-col px-6 py-8 sm:px-12 lg:px-16 lg:py-12">
          <Wordmark />
          <LandingNotice />
          <div className="mt-12 max-w-xl lg:mt-auto lg:mb-16">
            <h1 className="font-serif text-4xl leading-[1.05] tracking-[-0.035em] sm:text-5xl lg:text-[3.4rem]">
              {HOME_H1}
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-soft sm:text-lg">{HOME_SUBLINE}</p>
            <div className="mt-8 w-full max-w-[400px]">{signIn}</div>
            <div className="mt-8">
              <LandlordLogoCloud />
            </div>
          </div>
        </div>
        <div className="relative hidden overflow-hidden bg-[#e7e0d4] lg:block">
          <div className="absolute inset-0 grid place-items-center">
            <div className="relative w-[380px]">
              <img
                src={asset("/photos/03.jpg")}
                alt=""
                width={416}
                height={576}
                loading="lazy"
                className="absolute -left-16 top-16 h-72 w-52 -rotate-6 rounded-[28px] object-cover opacity-90 shadow-[0_20px_50px_rgba(48,36,22,0.18)]"
              />
              <article className="relative overflow-hidden rounded-[32px] bg-card shadow-[0_30px_80px_rgba(48,36,22,0.22)]">
                <img
                  src={asset("/photos/01.jpg")}
                  alt="Vardagsrum i en lägenhet på Södermalm"
                  width={760}
                  height={1040}
                  loading="lazy"
                  className="h-[520px] w-full object-cover"
                />
                <div className="absolute top-4 left-4 rounded-full bg-card/95 px-3 py-1 text-sm font-medium">Ny – 3 min sedan</div>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#1c1916] via-[#1c1916]/80 to-transparent p-6 pt-24 text-paper">
                  <p className="text-sm font-medium text-white">Södermalm · HomeQ</p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight">Blekingegatan 42</p>
                  <p className="num mt-1 text-sm text-paper/85">12 450 kr · 2 rok · 54 m²</p>
                </div>
              </article>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl px-6 py-16 sm:px-12">
        {HOME_SECTIONS.map((section) => (
          <section key={section.title} className="border-t border-line py-10">
            <h2 className="font-serif text-3xl tracking-[-0.03em]">{section.title}</h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-soft">{section.body}</p>
          </section>
        ))}

        <section className="border-t border-line py-10">
          <h2 className="font-serif text-3xl tracking-[-0.03em]">Så fungerar det</h2>
          <ol className="mt-6 max-w-2xl space-y-4">
            {HOME_STEPS.map((step, index) => (
              <li key={step} className="flex gap-4">
                <span
                  aria-hidden
                  className="num grid h-8 w-8 shrink-0 place-items-center rounded-full bg-pine-soft text-sm font-medium text-pine-deep"
                >
                  {index + 1}
                </span>
                <p className="pt-1 text-base leading-relaxed">{step}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-t border-line py-10">
          <h2 className="font-serif text-3xl tracking-[-0.03em]">Det här ingår</h2>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-soft">{includedCopy()}</p>
        </section>

        <section className="border-t border-line py-10" aria-labelledby="vanliga-fragor">
          <h2 id="vanliga-fragor" className="font-serif text-3xl tracking-[-0.03em]">
            Vanliga frågor
          </h2>
          <div className="mt-6">
            <FaqList />
          </div>
        </section>
      </div>
      </main>
      <SiteFooter />
    </div>
  );
}
