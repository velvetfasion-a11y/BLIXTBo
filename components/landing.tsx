import { FaqList } from "@/components/faq-list";
import { LandingNotice } from "@/components/landing-notice";
import { LandlordLogoCloud } from "@/components/landlord-logo-cloud";
import { Wordmark } from "@/components/mark";
import { SiteFooter } from "@/components/site-footer";
import { HOME_H1, HOME_SECTIONS, HOME_STEPS, HOME_SUBLINE, includedCopy } from "@/lib/seo";

export function Landing({ signIn }: { signIn: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-paper">
      <main>
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <Wordmark />
        <LandingNotice />
        <div className="mt-8 grid items-center gap-10 md:grid-cols-[minmax(0,1fr)_320px] md:gap-8 lg:mt-12 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-12">
          <div className="min-w-0">
            <h1 className="font-serif text-4xl leading-[1.05] tracking-[-0.035em] sm:text-5xl lg:text-[3.4rem]">
              {HOME_H1}
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-soft sm:text-lg">{HOME_SUBLINE}</p>
            <div className="mt-8">
              <LandlordLogoCloud />
            </div>
          </div>
          <div className="mx-auto w-full max-w-[400px] md:mx-0 md:max-w-none">{signIn}</div>
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
