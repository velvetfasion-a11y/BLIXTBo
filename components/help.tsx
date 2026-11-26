import Link from "next/link";
import { FaqList } from "@/components/faq-list";
import { SiteFooter } from "@/components/site-footer";
import { SupportDesk } from "@/components/support";
import { Wordmark } from "@/components/mark";
import { premiumPriceKr, trialDays } from "@/lib/billing";
import { SUPPORT_EMAIL } from "@/lib/company";

export function Help() {
  const days = trialDays();
  const price = premiumPriceKr();

  return (
    <div className="min-h-dvh bg-paper">
      <div className="mx-auto w-full max-w-xl px-5 py-8 md:px-8 md:py-12">
        <Wordmark />
        <p className="mt-8 text-sm font-medium text-pine">Hjälp</p>
        <h1 className="mt-2 font-serif text-4xl tracking-[-0.03em]">Frågor och svar</h1>
        <p className="mt-3 text-sm leading-relaxed text-soft">
          Kort om hur Blixtbo fungerar, vad en betalning innebär, och hur du tar bort konto eller uppgifter.
        </p>
        <div className="mt-4 flex flex-wrap gap-4 text-sm font-medium">
          <Link href="/" className="text-pine">
            Till start
          </Link>
          <Link href="/installningar" className="text-pine">
            Till inställningar
          </Link>
        </div>

        <section className="mt-10" aria-labelledby="vanliga-fragor">
          <h2 id="vanliga-fragor" className="font-serif text-2xl tracking-[-0.03em]">
            Vanliga frågor
          </h2>
          <div className="mt-4">
            <FaqList />
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-serif text-2xl tracking-[-0.03em]">Hur Blixtbo fungerar</h2>
          <div className="mt-4 space-y-4 text-sm leading-relaxed text-soft">
            <p>
              Blixtbo bevakar hyresvärdarnas annonser och lägger nya bostäder överst. Du anger område, hyra, storlek och inflytt en gång. Ett ja kan skicka ansökan med profilen du redan fyllt i.
            </p>
            <p>
              Samma profil används hos varje hyresvärd: yrke, inkomst, hushåll, brev och dokument. Under Koll ser du ansökningar, ködagar och när en kö behöver förnyas.
            </p>
            <p>Gratisversionen har ett tak för automatiska ansökningar. Premium tar bort det taket.</p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-serif text-2xl tracking-[-0.03em]">Betalning och avslut</h2>
          <div className="mt-4 space-y-4 text-sm leading-relaxed text-soft">
            <p>
              Premium kostar {price} kr i månaden efter {days} dagars provperiod. Kortet läggs till här i appen. Du lämnar inte Blixtbo för en betalsida.
            </p>
            <p>
              Avsluta prenumerationen via Inställningar och sedan Prenumeration. Du behåller Premium tills den betalda perioden tar slut. Därefter blir kontot gratis, och inga fler dragningar görs. Du kan ångra ett planerat avslut innan perioden tar slut, på samma sida.
            </p>
            <p>En paus stänger av automatiska ansökningar utan att avsluta kontot. Den finns också under Prenumeration.</p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-serif text-2xl tracking-[-0.03em]">Radering av konto och uppgifter</h2>
          <div className="mt-4 space-y-4 text-sm leading-relaxed text-soft">
            <p>Under Inställningar, när du är inloggad, finns tre val. Du skriver RADERA innan något händer. Om inloggningen är för gammal ber vi dig logga in igen i ett fönster.</p>
            <p>
              <span className="font-medium text-ink">Radera bara Blixtbo-kontot.</span> Namn, e-post och kopplingen till inloggningen tas bort, så kontot går inte att öppna. Supportärenden och chattar med support tas också bort. Ansökningar, sparade sökningar och filter, meddelanden, hyresvärdarnas inloggningar, loggar och betaluppgifter lämnas kvar. Firebase-kontot finns kvar.
            </p>
            <p>
              <span className="font-medium text-ink">Radera alla uppgifter om mig.</span> Det är radering enligt dataskyddsförordningen (GDPR). Profil, ansökningar, sparade sökningar och filter, meddelanden och notiser, supportärenden och chattar med support, sparade inloggningar hos hyresvärdar och loggar som pekar på dig tas bort. Prenumerationen avslutas. Stripe-kunden anonymiseras, och Firebase-kontot tas bort.
            </p>
            <p>
              Fakturor och andra betalunderlag behålls, eftersom bokföringslagen kräver det. De kopplas inte längre till ditt namn eller din e-post.
            </p>
            <p>
              <span className="font-medium text-ink">Koppla bort länkade konton.</span> Inloggningar hos hyresvärdar tas bort, och Google och Apple kopplas bort. Blixtbo-kontot, profilen och prenumerationen finns kvar. Om Google eller Apple är ditt enda sätt att logga in behöver du en ny inloggning nästa gång.
            </p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-serif text-2xl tracking-[-0.03em]">Hyresvärdarnas inloggning och säkerhet</h2>
          <div className="mt-4 space-y-4 text-sm leading-relaxed text-soft">
            <p>
              När du kopplar en hyresvärd sparas inloggningen krypterad, så att Blixtbo kan bevaka kön och skicka ansökan. BankID sparas inte. Du kan koppla bort hyresvärdarna under Inställningar, valet Koppla bort länkade konton, eller en och en under Hyresvärdar.
            </p>
            <p>Google och Apple används bara för att logga in i Blixtbo. De ger inte hyresvärden tillgång till ditt Google- eller Apple-konto.</p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-serif text-2xl tracking-[-0.03em]">Kontakt</h2>
          <div className="mt-4 space-y-4 text-sm leading-relaxed text-soft">
            <p>
              Frågor om betalning, kontot eller dina uppgifter skickar du till{" "}
              <a className="font-medium text-ink" href={`mailto:${SUPPORT_EMAIL}`}>
                {SUPPORT_EMAIL}
              </a>
              .
            </p>
            <SupportDesk heading={false} />
          </div>
        </section>
      </div>
      <SiteFooter />
    </div>
  );
}
