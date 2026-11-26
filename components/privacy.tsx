import { LegalPage, LegalSection } from "@/components/legal-page";
import { COMPANY_NAME, ORG_NR, SUPPORT_EMAIL } from "@/lib/company";

export function Privacy() {
  return (
    <LegalPage
      kicker="Integritet"
      title="Integritetspolicy"
      intro="Så behandlar Blixtbo personuppgifter enligt dataskyddsförordningen (GDPR)."
    >
      <LegalSection title="Personuppgiftsansvarig">
        <p>{COMPANY_NAME} är personuppgiftsansvarig för behandlingen i Blixtbo.</p>
        {ORG_NR ? <p>Org.nr {ORG_NR}</p> : null}
        <p>
          E-post:{" "}
          <a className="font-medium text-ink" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
        </p>
      </LegalSection>

      <LegalSection title="Vilka uppgifter">
        <p>
          <span className="font-medium text-ink">Google-konto.</span> När du loggar in med Google tar vi emot namn, e-postadress och kontots identifierare, så att vi kan skapa kontot och känna igen dig. Väljer du Apple i stället gäller samma sak för det Apple-konto du använder för inloggningen. Vi får inte tillgång till övriga delar av Google- eller Apple-kontot.
        </p>
        <p>
          <span className="font-medium text-ink">Hyresvärdarnas inloggningar.</span> När du kopplar en hyresvärd sparas användarnamn och lösenord krypterat, så att Blixtbo kan bevaka kön och skicka ansökan. BankID sparas inte.
        </p>
        <p>
          <span className="font-medium text-ink">Ansökningar.</span> Profilen du fyller i, till exempel yrke, inkomst, hushåll, brev och dokument, samt sparade sökningar, filter, ansökningar, meddelanden och notiser.
        </p>
        <p>
          <span className="font-medium text-ink">Betalningar via Stripe.</span> Kortuppgifter hanteras av Stripe. Blixtbo lagrar inte hela kortnumret. Vi sparar kund- och prenumerationsidentitet hos Stripe, status, period och om en uppsägning är planerad, så att vi vet om Premium är igång.
        </p>
      </LegalSection>

      <LegalSection title="Varför">
        <p>Uppgifterna används för att tillhandahålla bevakning, notiser och ansökningar, för att ta betalt för Premium, och för att hålla kontot säkert. Det görs för att fullgöra avtalet med dig.</p>
        <p>Fakturor och andra betalunderlag sparas för att uppfylla bokföringslagen. Det är en rättslig förpliktelse. De används inte till marknadsföring.</p>
      </LegalSection>

      <LegalSection title="Lagring och mottagare">
        <p>
          Kontouppgifter sparas så länge kontot finns. Krypterade inloggningar hos hyresvärdar tas bort när du kopplar bort dem eller ber oss radera uppgifterna. Betalunderlag behålls den tid bokföringslagen kräver, normalt sju år, men kopplas inte längre till ditt namn eller din e-post när Stripe-kunden anonymiseras.
        </p>
        <p>
          Betalningar hanteras av Stripe. Inloggning och kontots uppgifter hanteras med Google Firebase. De behandlar uppgifterna för Blixtbos räkning för de delarna. En del av behandlingen kan ske utanför EU, med de skyddsåtgärder leverantörerna tillhandahåller för sådan överföring.
        </p>
      </LegalSection>

      <LegalSection title="Dina rättigheter">
        <p>
          Du kan begära tillgång, rättelse, radering, begränsning och dataportabilitet, och invända mot behandling som stödjer sig på berättigat intresse. Du kan också klaga hos Integritetsskyddsmyndigheten, imy.se.
        </p>
        <p>
          Radering gör du själv under Inställningar när du är inloggad. Du skriver RADERA innan något händer. Radera bara Blixtbo-kontot stänger inloggningen. Radera alla uppgifter om mig tar bort profil, ansökningar, meddelanden, hyresvärdarnas inloggningar och loggar som pekar på dig, avslutar prenumerationen och anonymiserar Stripe-kunden. Hur de tre valen skiljer sig beskrivs under Hjälp.
        </p>
      </LegalSection>

      <LegalSection title="Kontakt">
        <p>
          Frågor om personuppgifter skickar du till{" "}
          <a className="font-medium text-ink" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
