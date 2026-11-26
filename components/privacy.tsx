import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { Wordmark } from "@/components/mark";

export function Privacy() {
  return (
    <div className="min-h-dvh bg-paper">
      <div className="mx-auto w-full max-w-xl px-5 py-8 md:px-8 md:py-12">
        <Wordmark />
        <p className="mt-8 text-sm font-medium text-pine">Integritet</p>
        <h1 className="mt-2 font-serif text-4xl tracking-[-0.03em]">Så hanterar vi uppgifter</h1>
        <p className="mt-3 text-sm leading-relaxed text-soft">
          Blixtbo sparar det som behövs för att bevaka bostäder, skicka ansökningar och hålla koll på köer. Här står också vad en recension innehåller, och när den tas bort.
        </p>
        <div className="mt-4 flex flex-wrap gap-4 text-sm font-medium">
          <Link href="/" className="text-pine">
            Till start
          </Link>
          <Link href="/hjalp" className="text-pine">
            Hjälp
          </Link>
          <Link href="/installningar" className="text-pine">
            Inställningar
          </Link>
        </div>

        <section className="mt-10">
          <h2 className="font-serif text-2xl tracking-[-0.03em]">Recensioner</h2>
          <div className="mt-4 space-y-4 text-sm leading-relaxed text-soft">
            <p>
              När du har fått en lägenhet kan du lämna ett betyg från 1 till 5 och en valfri text, högst ungefär 1 000 tecken. Vi sparar ditt användar-id, betyget, texten, hyresvärden om den hör till ansökan, tidpunkten och om du samtyckt till att recensionen visas.
            </p>
            <p>
              Samtycket är frivilligt. Kryssar du i att vi får visa recensionen används bara förnamn. Utan den rutan visas recensionen inte för andra.
            </p>
            <p>Du kan ändra recensionen efteråt. Det finns en recension per lägenhet du har fått.</p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-serif text-2xl tracking-[-0.03em]">När recensionen raderas</h2>
          <div className="mt-4 space-y-4 text-sm leading-relaxed text-soft">
            <p>
              Recensioner raderas när Blixtbo-kontot raderas, och när du ber om att alla uppgifter om dig raderas. Det gör du under Inställningar. Du skriver RADERA innan något händer.
            </p>
            <p>
              Att bara koppla bort Google, Apple eller en hyresvärd lämnar recensionen kvar, eftersom kontot finns kvar.
            </p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-serif text-2xl tracking-[-0.03em]">Övriga uppgifter</h2>
          <div className="mt-4 space-y-4 text-sm leading-relaxed text-soft">
            <p>
              Profil, ansökningar, sparade sökningar, meddelanden och inloggningar hos hyresvärdar beskrivs under Hjälp. Inloggningen hos en hyresvärd sparas krypterad. BankID sparas inte.
            </p>
            <p>Fakturor och andra betalunderlag kan behöva sparas enligt bokföringslagen. De kopplas inte längre till ditt namn när uppgifterna raderas.</p>
          </div>
        </section>
      </div>
      <SiteFooter />
    </div>
  );
}
