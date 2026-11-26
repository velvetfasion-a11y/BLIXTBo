import { LegalPage, LegalSection } from "@/components/legal-page";
import { SellerIdentity } from "@/components/seller";
import { premiumPriceKr, trialDays } from "@/lib/billing";
import { SUPPORT_EMAIL } from "@/lib/company";

export function Terms() {
  const price = premiumPriceKr();
  const days = trialDays();

  return (
    <LegalPage
      kicker="Villkor"
      title="Köpvillkor för Blixtbo Premium"
      intro="Det här gäller när du startar provperioden eller betalar för Blixtbo Premium."
    >
      <LegalSection title="Säljare">
        <SellerIdentity />
      </LegalSection>

      <LegalSection title="Tjänsten">
        <p>
          Blixtbo är en sök- och aviseringstjänst. Vi bevakar hyresvärdarnas annonser och köer och kan skicka din ansökan med profilen du fyllt i. Blixtbo äger inga lägenheter, hyr inte ut bostäder och förmedlar inte hyreskontrakt. Vi kan inte garantera att du får en lägenhet. Hyresvärden bestämmer vem som får kontraktet, och du skriver avtalet med hyresvärden.
        </p>
      </LegalSection>

      <LegalSection title="Pris och provperiod">
        <p>
          Blixtbo Premium kostar {price} kr per månad. De första {days} dagarna är en gratis provperiod. När provperioden tar slut dras {price} kr automatiskt, och sedan samma belopp varje månad, om du inte har sagt upp innan dess.
        </p>
        <p>Provperioden är inte en separat produkt och inte en rabattkod. Kortet sparas när du startar, så att dragningen kan ske när provperioden tar slut.</p>
      </LegalSection>

      <LegalSection title="Uppsägning">
        <p>
          Du kan säga upp när som helst under Inställningar och sedan Prenumeration. Uppsägningen gäller till periodens slut. Du behåller Premium tills den påbörjade perioden, inklusive en pågående provperiod, tar slut. Därefter blir kontot gratis och inga fler dragningar görs. Du kan ångra ett planerat avslut på samma sida innan perioden tar slut.
        </p>
      </LegalSection>

      <LegalSection title="Ångerrätt">
        <p>
          Du har 14 dagars ångerrätt enligt lagen (2005:59) om distansavtal och avtal utanför affärslokaler. Fristen räknas från den dag avtalet ingås, alltså när du startar provperioden.
        </p>
        <p>
          Genom att starta provperioden begär du att den digitala tjänsten börjar levereras omedelbart, under ångerfristen, och du bekräftar att du känner till hur det påverkar ångerrätten. För en löpande digital tjänst innebär det att du kan få betala en proportionell del för den tid du hunnit använda tjänsten om du ångrar dig efter att leveransen har börjat. Ångerrätten upphör när tjänsten är fullgjord i sin helhet, om du i förväg uttryckligen har samtyckt till att den påbörjas och bekräftat att du därmed förlorar ångerrätten när avtalet är fullgjort.
        </p>
        <p>
          Premium är en löpande tjänst och är inte fullgjord bara för att provperioden har startat. Säger du upp inom 14 dagar, innan någon månadsavgift har dragits, avslutas prenumerationen och ingen avgift tas ut. Har en avgift redan dragits och ångerrätten fortfarande gäller återbetalar vi beloppet.
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
          Ingen månadsavgift tas ut om du säger upp innan provperioden tar slut. Efter en genomförd dragning gäller en vanlig uppsägning till periodens slut, och den redan betalda perioden betalas inte tillbaka. Undantaget är när ångerrätten ger rätt till återbetalning, eller när vi har dragit fel belopp.
        </p>
        <p>
          En återbetalning går tillbaka till samma betalmedel via Stripe. Att en ansökan inte leder till en lägenhet är inte skäl för återbetalning. Blixtbo kan inte garantera en bostad.
        </p>
        <p>Fakturor och andra betalunderlag behålls enligt bokföringslagen. De kopplas bort från ditt namn och din e-post om du ber oss radera uppgifterna om dig.</p>
      </LegalSection>
    </LegalPage>
  );
}
