import { FaqList } from "@/components/faq-list";
import { LandingNotice } from "@/components/landing-notice";
import { LandlordBoard } from "@/components/landlord-board";
import { Wordmark } from "@/components/mark";
import { SiteFooter } from "@/components/site-footer";
import { HOME_H1, HOME_SECTIONS, HOME_STEPS, HOME_SUBLINE, includedCopy } from "@/lib/seo";

const VALUE_POINTS = [
  "Nya annonser från hyresvärdarna, samlade efter område, hyra och storlek.",
  "En profil räcker. Ett svep skickar ansökan innan de andra hunnit läsa klart.",
  "Ködagar och en påminnelse när en kö behöver förnyas.",
] as const;

export function Landing({ signIn }: { signIn: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-paper">
      <main>
      <div className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 sm:py-8 lg:px-8">
        <Wordmark />
        <LandingNotice />
        <div className="mt-6 grid items-start gap-8 md:mt-8 md:grid-cols-[minmax(0,1fr)_320px] md:gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-10">
          <div className="min-w-0">
            <h1 className="max-w-xl font-serif text-[1.75rem] leading-[1.08] tracking-[-0.035em] sm:text-4xl lg:text-5xl lg:leading-[1.05]">
              {HOME_H1}
            </h1>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-soft sm:mt-4 sm:text-lg">{HOME_SUBLINE}</p>
            <ul className="mt-4 max-w-xl space-y-2.5">
              {VALUE_POINTS.map((point) => (
                <li key={point} className="flex gap-2.5 text-sm leading-5 text-ink sm:text-[15px] sm:leading-6">
                  <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-pine" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
            <LandlordBoard />
          </div>
          <div className="mx-auto w-full max-w-[440px] md:mx-0 md:max-w-none md:sticky md:top-6">{signIn}</div>
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
