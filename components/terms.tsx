import { LegalPage, LegalSection } from "@/components/legal-page";
import { SellerIdentity } from "@/components/seller";
import { premiumPriceKr } from "@/lib/billing";
import { SUPPORT_EMAIL } from "@/lib/company";

export function Terms() {
  const price = premiumPriceKr();

  return (
    <LegalPage
      kicker="Villkor"
      title="Köpvillkor för Blixtbo Premium"
      intro="Det här gäller när du betalar för Blixtbo Premium."
    >
      <LegalSection title="Säljare">
        <SellerIdentity />
      </LegalSection>

      <LegalSection title="Tjänsten">
        <p>
          Blixtbo är en sök- och aviseringstjänst. Vi bevakar hyresvärdarnas annonser och köer och kan skicka din ansökan med profilen du fyllt i. Blixtbo äger inga lägenheter, hyr inte ut bostäder och förmedlar inte hyreskontrakt. Vi kan inte garantera att du får en lägenhet. Hyresvärden bestämmer vem som får kontraktet, och du skriver avtalet med hyresvärden.
        </p>
      </LegalSection>

      <LegalSection title="Pris">
        <p>
          Blixtbo Premium kostar {price} kr per månad. Beloppet dras när du startar, och sedan samma belopp varje månad, om du inte har sagt upp innan nästa period.
        </p>
        <p>Kortet sparas när du startar, så att den månatliga dragningen kan ske. Det är inte en rabattkod.</p>
      </LegalSection>

      <LegalSection title="Uppsägning">
        <p>
          Du kan säga upp när som helst under Inställningar och sedan Prenumeration. Uppsägningen gäller till periodens slut. Du behåller Premium tills den påbörjade perioden tar slut. Därefter görs inga fler dragningar. Du kan ångra ett planerat avslut på samma sida innan perioden tar slut.
        </p>
      </LegalSection>

      <LegalSection title="Ångerrätt">
        <p>
          Du har 14 dagars ångerrätt enligt lagen (2005:59) om distansavtal och avtal utanför affärslokaler. Fristen räknas från den dag avtalet ingås, alltså när du startar Premium.
        </p>
        <p>
          Genom att starta Premium begär du att den digitala tjänsten börjar levereras omedelbart, under ångerfristen, och du bekräftar att du känner till hur det påverkar ångerrätten. För en löpande digital tjänst innebär det att du kan få betala en proportionell del för den tid du hunnit använda tjänsten om du ångrar dig efter att leveransen har börjat. Ångerrätten upphör när tjänsten är fullgjord i sin helhet, om du i förväg uttryckligen har samtyckt till att den påbörjas och bekräftat att du därmed förlorar ångerrätten när avtalet är fullgjort.
        </p>
        <p>
          Premium är en löpande tjänst. Säger du upp inom 14 dagar och ångerrätten fortfarande gäller återbetalar vi den dragna månadsavgiften.
        </p>
        <p>
          Ångerrätten utövar du under Inställningar, eller genom att skriva till{" "}
          <a className="font-medium text-ink" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          . Ange kontots e-postadress.
        </p>
      </LegalSection>

      <LegalSection title="Återbetalning">
        <p>
          Efter en genomförd dragning gäller en vanlig uppsägning till periodens slut, och den redan betalda perioden betalas inte tillbaka. Undantaget är när ångerrätten ger rätt till återbetalning, eller när vi har dragit fel belopp.
        </p>
        <p>
          En återbetalning går tillbaka till samma betalmedel via Stripe. Att en ansökan inte leder till en lägenhet är inte skäl för återbetalning. Blixtbo kan inte garantera en bostad.
        </p>
        <p>Fakturor och andra betalunderlag behålls enligt bokföringslagen. De kopplas bort från ditt namn och din e-post om du ber oss radera uppgifterna om dig.</p>
      </LegalSection>
    </LegalPage>
  );
}
