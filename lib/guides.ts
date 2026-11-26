import type { Metadata } from "next";

const SITE_URL = "https://blixtbo.se";

export const GUIDE_UPDATED = "2026-11-26";
export const GUIDE_UPDATED_LABEL = "26 november 2026";

export const GUIDE_DISCLAIMER =
  "Det här är allmän information, inte juridisk rådgivning. Hyresvärdars krav och myndigheternas regler ändras. Läs annonsen och källorna längst ner, och bedöm din egen situation. Blixtbo äger inga lägenheter, hyr inte ut bostäder och garanterar inget kontrakt. Det är hyresvärden som väljer hyresgäst och skriver avtalet med dig.";

export type TextPart = string | { label: string; href: string };
export type Paragraph = string | TextPart[];

export type GuideSource = { name: string; url: string };

export type GuideSection = {
  heading: string;
  paragraphs: Paragraph[];
  bullets?: string[];
};

export type Guide = {
  slug: string;
  title: string;
  description: string;
  dek: string;
  summary: string;
  sections: GuideSection[];
  steps: string[];
  related: string[];
  cta: string;
  sources: GuideSource[];
};

const skatteverketPersonbevis =
  "https://www.skatteverket.se/privat/folkbokforing/personbevis.4.18e1b10334ebe8bc80003671.html";
const hyresgastforeningenInkomst =
  "https://www.hyresgastforeningen.se/stod-och-rad/flytta/inkomstkrav-hyresratt/";
const hyresgastforeningenRapport =
  "https://www.hyresgastforeningen.se/aktuellt/extern-nyhet/ny-rapport-inkomstkraven-sjunker--men-alldeles-for-langsamt!tt-4160153/";
const boverketKrav =
  "https://www.boverket.se/sv/om-boverket/publikationer/2017/hyresvardars-krav-pa-blivande-hyresgaster/";
const bfRegler =
  "https://bostad.stockholm.se/sa-gar-det-till/regler/stockholms-kommunala-bolags-regler-for-godkannande-av-hyresgast/";
const bfIntyg = "https://bostad.stockholm.se/sa-gar-det-till/vagen-till-en-bostad/visa-intyg/";
const hyresgastforeningenBorgen =
  "https://www.hyresgastforeningen.se/stod-och-rad/avtal-och-juridik/hyresvarden-kraver-borgensman/";
const jordabalken =
  "https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/jordabalk-1970994_sfs-1970-994/";
const boverketGaranti =
  "https://www.boverket.se/sv/samhallsplanering/bostadsmarknad/bostadsmarknaden/bostadsmarknadsenkaten/kommunernas-verktyg/kommunala-hyresgarantier/";
const stockholmBoende = "https://boende.stockholm/skaffa-bostad/";
const kronofogdenAnmarkning =
  "https://kronofogden.se/kontakta-oss/fragor-och-svar/betalningsanmarkning/2021-04-12-hur-lange-finns-uppgifterna-om-betalningsanmarkning-kvar";
const imyAnmarkning = "https://www.imy.se/privatperson/kreditupplysning/betalningsanmarkningar/";
const imyRegister =
  "https://www.imy.se/vanliga-fragor-och-svar/hur-far-jag-veta-vad-som-star-om-mig-i-kreditupplysningsregistren/";
const konsumentverketInkasso = "https://www.konsumentverket.se/ekonomi/inkasso-och-betalningsanmarkningar/";
const konsumentverketSkulder = "https://www.konsumentverket.se/ekonomi/skulder-och-skuldsanering";
const konsumentverketAndrahand =
  "https://www.konsumentverket.se/varor-och-tjanster/hyra-hyreslagenhet-i-andra-hand/";
const polisenAnnons =
  "https://polisen.se/utsatt-for-brott/polisanmalan/bedragerier/bedragerier/annonsbedrageri/";
const polisenBankid =
  "https://polisen.se/utsatt-for-brott/polisanmalan/bedragerier/bedragerier/vaga-vara-otrevlig/";
const bfRegistrera = "https://bostad.stockholm.se/sa-gar-det-till/vagen-till-en-bostad/registrera-dig/";
const bfAvgift = "https://bostad.stockholm.se/sa-gar-det-till/regler/avgift/";
const bfFaq = "https://bostad.stockholm.se/om-oss/fragor-och-svar/";
const sssbFaq = "https://www.sssb.se/vanliga-fragor-och-svar/";
const sssbRegler = "https://www.sssb.se/koregler/";
const homeq = "https://www.homeq.se/lediga-lagenheter/stockholm";
const hyresgastforeningenAndrahand =
  "https://www.hyresgastforeningen.se/stod-och-rad/andrahand-och-inneboende/hyra-en-lagenhet-i-andra-hand/";
const hyresgastforeningenUthyrning =
  "https://www.hyresgastforeningen.se/stod-och-rad/andrahand-och-inneboende/uthyrning-i-andra-hand/";
const hyresgastforeningenForstahand =
  "https://www.hyresgastforeningen.se/stod-och-rad/avtal-och-juridik/forstahandskontrakt/";
const hyresgastforeningenBesittning =
  "https://www.hyresgastforeningen.se/stod-och-rad/avtal-och-juridik/besittningsratt/";
const domstolAndrahand =
  "https://www.domstol.se/amnen/hyra-bostadsratt-och-arrende/hyra-av-bostad-och-lokal/hyra-i-andra-hand/ansok-om-godkannande-av-andrahandsuthyrning/";

export const guides: Guide[] = [
  {
    slug: "hyra-forstahand-utan-fast-inkomst",
    title: "Hyra förstahand utan jobb eller fast inkomst",
    description:
      "Så kan studiemedel, a-kassa, sjukersättning, pension, företagande, sparkapital, borgen och kommunal hyresgaranti räknas när du söker förstahandskontrakt.",
    dek: "Du kan ibland få ett förstahandskontrakt utan fast jobb, om du kan visa att hyran blir betald.",
    summary:
      "Det finns ingen regel som säger att du måste ha en tillsvidareanställning för att få ett förstahandskontrakt. Hyresvärden vill se att hyran kan betalas. Studiemedel, a-kassa, ersättning från Försäkringskassan, pension, företagande och sparande kan räcka hos vissa, och nekas hos andra. Läs kraven i annonsen och fråga innan du lägger tid på ansökan.",
    sections: [
      {
        heading: "Hyresvärden prövar betalningen, inte titeln på jobbet",
        paragraphs: [
          "Varje hyresvärd sätter sina egna krav. En del vill se lön från en fast anställning. Andra räknar flera slags inkomster, så länge beloppet räcker till hyran och det som ska bli kvar att leva på.",
          [
            "Hos Stockholms kommunala bolag, när du söker via Bostadsförmedlingen, ska inkomsten stå i proportion till hyran. Från den 1 januari 2026 ska en ensamstående vuxen ha minst 6 243 kronor kvar per månad efter att hyran är betald. För två personer som får räkna ihop inkomsten är beloppet 10 314 kronor. Beloppet följer Kronofogdens normalbelopp, så ",
            { label: "kontrollera den aktuella sidan", href: bfRegler },
            " innan du räknar.",
          ],
          [
            "Många större privata hyresvärdar använder i stället en tumregel om ungefär tre gånger månadshyran i bruttoinkomst. Det är inte en lag. Hyresgästföreningen beskriver det som vanligt, och menar att kravet ofta är onödigt hårt. Läs mer i guiden ",
            { label: "Vad hyresvärdar kräver", href: "/guider/vad-hyresvardar-kraver" },
            ".",
          ],
        ],
      },
      {
        heading: "Inkomster som kan räknas",
        paragraphs: [
          "Vad som räknas beror på hyresvärden. De här inkomsterna är värda att visa, med beslutet eller utbetalningen som underlag:",
        ],
        bullets: [
          "Studiemedel och studiebidrag från CSN. De kommunala bolagen i Stockholm räknar studiebidrag. Stockholms stads hyresgaranti räknar studiestöd. Andra hyresvärdar kan räkna hela studiemedlet, bara bidragsdelen, eller inget alls. Fråga, och visa beslutet.",
          "A-kassa. Bostadsförmedlingen räknar a-kassa som inkomst om du kan visa beslutet och hur många dagar du har kvar. En del hyresvärdar vill också se medlemsbevis om du har en visstidsanställning.",
          "Sjukersättning, aktivitetsersättning och andra ersättningar från Försäkringskassan. Stockholms stads hyresgaranti räknar sjukersättning. De kommunala bolagen nämner inte sjukersättning som en egen post, men räknar \"motsvarande\" inkomster. Visa beslutet och fråga om de räknar beloppet.",
          "Pension från Pensionsmyndigheten eller ett bolag som betalar tjänstepension. Intyget ska visa vad du får.",
          "Försörjningsstöd. De kommunala bolagen i Stockholm kan räkna ekonomiskt bistånd från Stockholms kommun. Stockholms stads kommunala hyresgaranti räknar inte försörjningsstöd. Andra hyresvärdar gör olika.",
          "Bostadsbidrag, barnbidrag och underhållsbidrag kan räknas av de kommunala bolagen i Stockholm. Ta med besluten om hyresvärden ber om dem.",
        ],
      },
      {
        heading: "Om du är företagare",
        paragraphs: [
          "Egen firma eller aktiebolag går att visa, men hyresvärden vill oftast se att inkomsten är verklig och har funnits en tid. Hos de kommunala bolagen i Stockholm ska företaget ha varit verksamt i minst ett år, och du ska kunna styrka inkomsten.",
          "Bostadsförmedlingen beskriver vilka papper hyresvärden brukar vilja se: senaste deklarationen, registreringsbevis från Skatteverket, balans- och resultatrapport, senast fastställda bokslut och ett intyg från revisorn om årets beräknade resultat. Tar du lön från aktiebolaget brukar de tre senaste lönebeskeden också behövas.",
          "Ett registerutdrag som visar F-skatt räcker inte ensamt. Det visar att företaget finns, inte hur mycket du kan betala i hyra.",
        ],
      },
      {
        heading: "Sparkapital och bankintyg",
        paragraphs: [
          "Sparpengar kan ibland komplettera en låg eller ojämn inkomst. Be banken om ett kontoutdrag eller ett intyg som visar saldot, och fråga hyresvärden om de godtar det.",
          "Det är inte en rättighet. De kommunala bolagen i Stockholm beskriver sin prövning utifrån inkomst kvar efter hyran, inte utifrån sparkapital. Räkna därför inte med att ett bankintyg ersätter inkomstkravet.",
        ],
      },
      {
        heading: "Förskottshyra",
        paragraphs: [
          "En del hyresvärdar går med på att du betalar hyra i förväg, i stället för att någon går i borgen. Kom överens skriftligt: hur många månader, när pengarna ska betalas och vad som händer med dem om du flyttar.",
          [
            "Betala inte ett stort belopp för att få se lägenheten eller för att \"reservera\" den. Det är en vanlig form av bedrägeri. Läs ",
            { label: "Förstahand, andrahand och hyresbedrägerier", href: "/guider/forstahand-andrahand-och-bedragerier" },
            " innan du för över pengar.",
          ],
        ],
      },
      {
        heading: "Borgen, borgensföretag och kommunens hyresgaranti",
        paragraphs: [
          [
            "Borgen betyder att en annan person lovar att betala hyran om du inte gör det. Läs ",
            { label: "guiden om borgen", href: "/guider/borgen" },
            " innan någon skriver på. Den som går i borgen tar en riktig skuld.",
          ],
          "Det finns också företag som mot en avgift ställer en hyresgaranti åt hyresvärden. Villkoren är företagets. Läs vad avgiften är, hur länge garantin gäller och om du ska betala tillbaka det som företaget lagt ut. En sådan garanti är inte samma sak som kommunens.",
          "Kommunen kan ställa en hyresgaranti för hushåll som har råd med hyran men ändå inte blir godkända, till exempel vid en tillfällig anställning eller en betalningsanmärkning. Boverket beskriver det som en möjlighet för kommunen, inte en skyldighet. Om garantin används blir du skuldsatt till kommunen.",
          "Stockholms stad kan erbjuda kommunal hyresgaranti till barnfamiljer som har betalningsförmåga. Garantin gäller ett nytt förstahandskontrakt med besittningsskydd i Stockholm. Du står själv på kontraktet och ska betala hyran. Som inkomst räknas lön, a-kassa, sjukersättning, studiestöd och andra ersättningar från Försäkringskassan eller Pensionsmyndigheten. Försörjningsstöd räknas inte. Du ska vara stadigvarande bosatt i Stockholm, ha barn i hushållet, och betalningsanmärkningar får inte ha tillkommit de senaste tolv månaderna. Pågående avbetalningar ska ha skötts under samma tid.",
          "Bor du i en annan kommun är det den kommunens regler som gäller. Fråga kommunen, inte en slumpmässig mellanhand.",
        ],
      },
      {
        heading: "Lägre krav, studentbostad och ett tillfälligt kontrakt som steg",
        paragraphs: [
          "Kraven skiljer sig mycket. Hyresgästföreningen har beskrivit att många allmännyttiga bolag har sänkt eller tagit bort inkomstkrav, medan de flesta större privata värdar ligger kvar kring tre gånger hyran. Leta därför hos fler än en hyresvärd, och läs just den annonsen.",
          [
            "Studerar du kan studentbostad vara en egen väg, med andra köer och andra intyg. Hos Bostadsförmedlingen och hos ",
            { label: "Stockholms studentbostäder", href: "/guider/bostadskoer-stockholm" },
            " behöver du visa studierna. Ett studentkontrakt är ofta tidsbegränsat.",
          ],
          "Korttidskontrakt och andrahand kan vara ett sätt att bo medan du samlar kötid och boendereferenser. Ett korttidskontrakt via Bostadsförmedlingen nollställer inte din kötid. Ett tillsvidarekontrakt gör det. Andrahand kräver att förstahandshyresgästen har tillstånd att hyra ut. Det ger dig inte rätt att ta över förstahandskontraktet.",
          "Genomgångsbostäder hos SHIS Bostäder i Stockholm förmedlas via socialtjänsten. Det är inte en kö du ställer dig i själv.",
        ],
      },
    ],
    steps: [
      "Läs kraven i annonsen innan du ansöker. Olika hyresvärdar räknar olika inkomster.",
      "Samla beslut och utbetalningar för den inkomst du har: CSN, a-kassa, Försäkringskassan, Pensionsmyndigheten eller företaget.",
      "Fråga om de godtar just den inkomsten, eller om de vill ha borgen, sparande eller en hyresgaranti.",
      "Har du betalningsförmåga men får nej, fråga din kommun om kommunal hyresgaranti. I Stockholm gäller den barnfamiljer och har egna villkor.",
      "Sök även studentbostad eller korttid om det passar. Håll koll på kötiden så att ett tillfälligt kontrakt inte nollställer den.",
      "Betala inte stora belopp innan du har sett lägenheten och har ett påskrivet avtal.",
    ],
    related: ["vad-hyresvardar-kraver", "borgen", "inkomstintyg-och-dokument"],
    cta: "När du vet vad hyresvärden vill se kan Blixtbo bevaka lediga lägenheter och skicka din ansökan. Hyresvärden väljer själv vem som får kontraktet.",
    sources: [
      { name: "Bostadsförmedlingen: regler för godkännande hos de kommunala bolagen", url: bfRegler },
      { name: "Bostadsförmedlingen: vilka intyg hyresvärden brukar vilja se", url: bfIntyg },
      { name: "Hyresgästföreningen: inkomstkrav", url: hyresgastforeningenInkomst },
      { name: "Hyresgästföreningen: rapport om inkomstkrav, 27 november 2025", url: hyresgastforeningenRapport },
      { name: "Stockholms stad: skaffa bostad och kommunal hyresgaranti", url: stockholmBoende },
      { name: "Boverket: kommunala hyresgarantier", url: boverketGaranti },
    ],
  },
  {
    slug: "bestall-personbevis",
    title: "Så beställer du personbevis",
    description:
      "Beställ personbevis hos Skatteverket med e-legitimation, välj den typ hyresvärden ber om och se om du kan skriva ut det själv eller måste beställa med post.",
    dek: "Personbevis beställer du hos Skatteverket. Med e-legitimation kan du skriva ut flera typer själv.",
    summary:
      "Ett personbevis är ett utdrag ur folkbokföringen. Bara Skatteverket utfärdar det, och det gäller inte som legitimation. Har du e-legitimation och har fyllt 16 år kan du ladda ner personbevis som bara gäller dig. Uppgifter om barn eller närstående beställer du med post till folkbokföringsadressen.",
    sections: [
      {
        heading: "Fråga först vilken typ hyresvärden vill ha",
        paragraphs: [
          "Skatteverket har flera personbevis, och rätt typ beror på vad mottagaren ska använda det till. Det finns inte en sort som alla hyresvärdar kräver. Fråga innan du beställer, så att du inte skickar ett intyg som saknar adressen, civilståndet eller familjen.",
          "Ska hyresvärden bara se dina egna uppgifter räcker ofta ett utdrag du skriver ut själv. \"Utdrag om folkbokföringsuppgifter\" visar uppgifter ur folkbokföringen. \"Adress\" är smalare. Behöver de se partner eller barn är det ett personbevis med andras uppgifter, till exempel ett familjebevis. Det skickas med post.",
          "Söker du via Bostadsförmedlingen hämtar de i många fall familjeuppgifterna själva, från ett system kopplat till folkbokföringen, när du blir aktuell för en bostad. Du behöver alltså inte alltid beställa ett familjebevis för den vägen. Läs vad just den hyresvärden ber om.",
        ],
      },
      {
        heading: "Skriv ut själv med e-legitimation",
        paragraphs: [
          "Är du över 16 år och har e-legitimation loggar du in i Skatteverkets e-tjänst och laddar ner personbeviset. Du skriver ut det själv, eller sparar filen och skickar den som hyresvärden ber om.",
          "De här typerna kan du ladda ner själv, enligt Skatteverket: Adress, Anställning, Fondansökan/Stipendium, Hemortsbevis, Id-kort, Inbjudan, Pass, Studier, Utdrag om folkbokföringsuppgifter på svenska, samma utdrag på engelska, och Yrkeslegitimation.",
          "Saknar du e-legitimation kan du beställa personbeviset med post. Behöver du dator eller skrivare kan du använda en kunddator på ett servicekontor.",
        ],
      },
      {
        heading: "När det kommer med post",
        paragraphs: [
          "Personbevis som innehåller uppgifter om andra personer, till exempel barn eller närstående, måste beställas via post. Skatteverket skickar det till den adress som är registrerad i folkbokföringen för den person som beviset gäller. Det skickas alltså inte hem till dig om du beställer ett bevis om någon annan.",
          "Ett familjebevis är en typ av personbevis. Du beställer det på samma sida, Hitta och beställ personbevis.",
          "Behöver du beviset till en annan adress än folkbokföringsadressen kontaktar du Skatteverket. Du kan också be att få ditt eget personbevis till din digitala brevlåda. Det görs genom att kontakta Skatteverket, inte genom den vanliga utskriften.",
        ],
      },
      {
        heading: "Innan du skickar det till hyresvärden",
        paragraphs: [
          "Läs igenom utdraget. Namn, personnummer och adress ska stämma med det du angett i ansökan. En gammal adress gör att hyresvärden och folkbokföringen säger emot varandra.",
          "Personbeviset är inte en identitetshandling. Hyresvärden kan dessutom vilja se pass, nationellt id-kort eller körkort. Det är en separat handling.",
        ],
      },
    ],
    steps: [
      "Fråga hyresvärden vilken typ av personbevis de vill ha, och om de vill se familjen eller bara dig.",
      "Gå till Skatteverkets sida om personbevis och välj typ i tjänsten Hitta och beställ personbevis.",
      "Har beviset bara dina uppgifter, och du har e-legitimation och har fyllt 16: logga in, ladda ner och spara filen.",
      "Innehåller det uppgifter om andra: beställ med post. Det skickas till personens folkbokföringsadress.",
      "Kontrollera namn, personnummer och adress innan du skickar filen eller pappret vidare.",
      "Saknar du e-legitimation eller skrivare: beställ med post, eller skriv ut på ett servicekontor.",
    ],
    related: ["inkomstintyg-och-dokument", "vad-hyresvardar-kraver"],
    cta: "När personbeviset ligger redo kan du hålla ihop resten av ansökan på ett ställe. Blixtbo bevakar lediga lägenheter och skickar ansökan åt dig. Kontraktet skriver du med hyresvärden.",
    sources: [
      { name: "Skatteverket: personbevis", url: skatteverketPersonbevis },
      { name: "Bostadsförmedlingen: intyg, och när familjeuppgifter hämtas", url: bfIntyg },
    ],
  },
  {
    slug: "vad-hyresvardar-kraver",
    title: "Vad hyresvärdar kräver",
    description:
      "Inkomstkrav, kreditupplysning, referenser, anställningsintyg, legitimation och folkbokföring: så brukar hyresvärdar pröva den som söker hyresrätt.",
    dek: "Hyresvärden prövar oftast inkomst, kreditupplysning och referenser. Kraven skiljer sig åt.",
    summary:
      "Det finns ingen nationell lista som alla hyresvärdar måste följa. De flesta prövar att hyran kan betalas. Kreditupplysning är vanligt. Många ber också om inkomstintyg, referenser och legitimation. Läs annonsen, för två hyresvärdar på samma gata kan ha olika regler.",
    sections: [
      {
        heading: "Inkomstkrav",
        paragraphs: [
          "Hyresgästföreningen beskriver inkomstkravet så här: du ska kunna betala hyran och ha pengar kvar att leva för. Hur högt kravet är i förhållande till hyran bestämmer hyresvärden.",
          "En vanlig tumregel hos större privata hyresvärdar är en bruttoinkomst på omkring tre gånger månadshyran. Hyresgästföreningen skrev i november 2025 att de flesta större privata värdar låg kvar där, medan många allmännyttiga bolag hade sänkt eller slopat kravet. Tre gånger hyran är alltså en vana på marknaden, inte en lag.",
          "Stockholmshem, Familjebostäder, Svenska Bostäder, Stadsholmen och Micasa har gemensamma regler när bostaden går via Bostadsförmedlingen. De tittar på vad som blir kvar efter hyran, inte på en multipel. Från den 1 januari 2026 är beloppet 6 243 kronor i månaden för en ensamstående vuxen och 10 314 kronor när inkomsterna räknas ihop. Beloppet motsvarar Kronofogdens normalbelopp och kan ändras.",
          "Som inkomst räknar de bolagen lön, pension, studiebidrag, försörjningsstöd från Stockholms kommun, bostadsbidrag, barnbidrag, underhållsbidrag, a-kassa eller motsvarande. För att två personer ska få räkna ihop inkomsten finns villkor, till exempel att ni varit skrivna på samma adress i tolv månader, stått som medboende i tolv månader, eller att den andra säger upp sitt boende. Läs den aktuella sidan innan du utgår från att era löner får slås ihop.",
          "På en ungdomslägenhet prövas bara huvudsökandens inkomst. Du kan bli godkänd med borgen om minst 2 081 kronor blir kvar per månad efter hyran, enligt beloppet från den 1 januari 2026. På ungdomslägenheter med kompisavtal godtas inte borgen.",
        ],
      },
      {
        heading: "Kreditupplysning och betalningsanmärkning",
        paragraphs: [
          "Boverkets kartläggning från 2017 visade att kreditupplysning var det vanligaste sättet att pröva en blivande hyresgäst. Det är fortfarande det de flesta annonser utgår från: hyresvärden beställer upplysningen, du behöver sällan köpa en själv i förväg.",
          [
            "En betalningsanmärkning gör det svårare, men den är inte alltid ett automatiskt nej. De kommunala bolagen i Stockholm kräver att en skuld hos Kronofogden antingen är betald eller ingår i en avbetalning, löneutmätning eller skuldsanering som fungerat i minst sex månader. Anmärkningar som gäller ett tidigare boende godtas inte. Läs ",
            { label: "vad du kan göra vid en betalningsanmärkning", href: "/guider/betalningsanmarkning" },
            ".",
          ],
        ],
      },
      {
        heading: "Referenser från tidigare boende",
        paragraphs: [
          "Många hyresvärdar ringer eller mejlar en tidigare hyresvärd. De kommunala bolagen i Stockholm kräver goda boendereferenser om du har haft ett förstahandskontrakt: hyran ska ha betalats i tid de senaste sex månaderna, och du ska inte ha stört boendet de senaste tolv månaderna.",
          "Har du blivit avhyst på grund av hyresskuld kan du prövas tidigast ett år efter att det gamla avtalet upphörde, och skulden ska vara betald. Gällde avhysningen otillåten andrahand eller störningar är väntetiden tre år. Det är de bolagens regler, inte en lag som gäller varje hyresvärd.",
        ],
      },
      {
        heading: "Anställningsintyg, legitimation och folkbokföring",
        paragraphs: [
          [
            "Har du lön brukar hyresvärden vilja se lönebesked och ett intyg från arbetsgivaren. Exakt vilka rader intyget ska innehålla står i guiden ",
            { label: "Inkomstintyg och dokument", href: "/guider/inkomstintyg-och-dokument" },
            ".",
          ],
          "Legitimation är en egen handling. Pass, nationellt id-kort eller körkort visar vem du är. Ett personbevis gör inte det. Skatteverket skriver uttryckligen att personbevis inte kan användas som identitetshandling.",
          "Folkbokföringen används för att se var du är skriven, och för att en kreditupplysning ska gå att göra. De kommunala bolagen skriver att de följer folkbokföringslagen. Ändra adressen hos Skatteverket när du flyttar, så att ansökan och registret stämmer överens. Är du inte folkbokförd i Sverige kan hyresvärden ha svårt att göra den vanliga prövningen. Fråga vad de godtar i stället.",
        ],
      },
    ],
    steps: [
      "Läs kraven i annonsen. Utgå inte från att tre gånger hyran, eller beloppet kvar efter hyra, gäller hos just den hyresvärden.",
      "Räkna på hyran mot den inkomst hyresvärden faktiskt räknar. Fråga om studiemedel, a-kassa, pension eller bidrag ingår.",
      "Låt hyresvärden ta kreditupplysningen. Köp inte en egen om de inte ber om den.",
      "Be en tidigare hyresvärd om att få uppge dem som referens, om du har bott med eget kontrakt.",
      "Ha legitimation och ett aktuellt personbevis redo, och se till att folkbokföringsadressen stämmer.",
    ],
    related: ["hyra-forstahand-utan-fast-inkomst", "inkomstintyg-och-dokument", "betalningsanmarkning"],
    cta: "Blixtbo ändrar inte hyresvärdens krav. Tjänsten bevakar annonserna och skickar din ansökan. Vem som får lägenheten bestämmer hyresvärden.",
    sources: [
      { name: "Hyresgästföreningen: inkomstkrav", url: hyresgastforeningenInkomst },
      { name: "Hyresgästföreningen: rapport om inkomstkrav, 27 november 2025", url: hyresgastforeningenRapport },
      { name: "Bostadsförmedlingen: regler för de kommunala bolagen", url: bfRegler },
      { name: "Boverket: hyresvärdars krav på blivande hyresgäster (2017)", url: boverketKrav },
      { name: "Skatteverket: personbevis är inte en identitetshandling", url: skatteverketPersonbevis },
    ],
  },
  {
    slug: "borgen",
    title: "Borgen för hyreskontrakt",
    description:
      "Vem som kan gå i borgen för en hyresrätt, vad åtagandet innebär, hur det kan sägas upp och vilka alternativ som finns.",
    dek: "Borgen betyder att någon annan lovar att betala hyran om du inte gör det.",
    summary:
      "En borgensman tar på sig att betala hyran om du inte gör det. Hyresvärden får be om borgen när det finns ett sakligt skäl, oftast för att inkomsten inte bedöms räcka. Det finns inget lagstadgat inkomstkrav på den som går i borgen. Läs texten innan någon skriver på, och titta på alternativen om ingen kan ställa upp.",
    sections: [
      {
        heading: "Vad det innebär",
        paragraphs: [
          "Hyresgästföreningen beskriver borgen så här: någon åtar sig att betala en skuld för dig. För hyresvärden är det en säkerhet. För dig och för borgensmannen är det ett åtagande som kan gälla i flera år.",
          "Läs om borgensmannen kan krävas direkt, eller först efter att hyresvärden har försökt få betalt av dig. Det står i handlingen. Skriv inte på en text du inte har läst, och låt inte någon annan skriva på åt dig.",
          "Hyresgästföreningen skriver att hyresvärden kan kräva borgen när det finns ett sakligt motiv, till exempel när du inte kan visa en tillräcklig inkomst. Borgen bör inte krävas slentrianmässigt. Kan du redan visa att hyran är säkrad är det rimligt att fråga varför borgen behövs.",
        ],
      },
      {
        heading: "Vem som kan gå i borgen",
        paragraphs: [
          "Lagen sätter inte en viss lön, anställningstid eller ålder. Hyresvärden bedömer om personen kan betala hyran om du inte gör det, och får säga nej.",
          "I praktiken vill många se en jämn inkomst, en kreditupplysning utan nya anmärkningar och ett svenskt personnummer så att upplysningen går att göra. En förälder, partner eller annan närstående är vanligt, men det måste inte vara en släkting. Personen ska förstå att det är hens egen plånbok som står som säkerhet.",
          "På ungdomslägenheter hos de kommunala bolagen i Stockholm kan borgen komplettera inkomstkravet. På ungdomslägenheter med kompisavtal godtas den inte. Det är ett exempel på att samma ord, borgen, inte betyder samma sak i varje kö.",
        ],
      },
      {
        heading: "Hur länge åtagandet gäller",
        paragraphs: [
          "Hur länge borgen gäller står i första hand i avtalet. För en bostadslägenhet finns dessutom en rätt att säga upp åtagandet. Borgensmannen får säga upp det så att det upphör vid det månadsskifte som infaller närmast efter nio månader från uppsägningen. Det får tidigast upphöra två år efter att åtagandet började gälla. Ett villkor som tar bort den rätten är ogiltigt. Regeln står i 12 kap. 28 a § jordabalken.",
          "Hyresgästföreningen rekommenderar att uppsägningen är skriftlig, skickas till hyresvärden och går som rekommenderat brev, så att det finns ett kvitto på att den kom fram.",
        ],
      },
      {
        heading: "Alternativ om ingen kan gå i borgen",
        paragraphs: [
          "Borgen är ett sätt att göra hyresvärden trygg. Det är inte det enda.",
        ],
        bullets: [
          "Visa en annan inkomst: studiemedel, a-kassa, sjukersättning, pension eller företaget. En del hyresvärdar nöjer sig med det.",
          "Fråga om ett bankintyg på sparkapital godtas som komplement. Det är inte en rättighet.",
          "Fråga om förskottshyra, och få belopp och villkor skriftligt. Betala inte innan du sett lägenheten och skrivit på avtalet.",
          "Fråga kommunen om kommunal hyresgaranti. Alla kommuner erbjuder den inte. I Stockholm gäller den barnfamiljer med betalningsförmåga.",
          "Ett företag kan sälja en hyresgaranti mot en avgift. Läs om du blir återbetalningsskyldig om företaget tvingas betala hyran. Det är inte samma sak som kommunens garanti.",
          "En del hyresvärdar låter två personer stå på kontraktet så att inkomsterna räknas ihop. Då är båda hyresgäster, inte borgensmän. Villkoren skiljer sig.",
        ],
      },
    ],
    steps: [
      "Läs annonsen och se om borgen krävs, eller om det räcker med inkomst.",
      "Visa först de intyg du har. Fråga varför borgen behövs om inkomsten redan täcker hyran.",
      "Låt den som funderar på att gå i borgen läsa hela förbindelsen, inklusive om hyresvärden kan kräva hen direkt.",
      "Skriv upp hur åtagandet kan sägas upp: nio månader, och tidigast efter två år, för en bostadslägenhet.",
      "Finns ingen borgensman, fråga om kommunal hyresgaranti, förskott eller en annan säkerhet som hyresvärden godtar.",
    ],
    related: ["hyra-forstahand-utan-fast-inkomst", "betalningsanmarkning", "vad-hyresvardar-kraver"],
    cta: "Blixtbo kan inte ställa borgen och väljer inte vem som får lägenheten. När underlaget är klart kan tjänsten bevaka annonser och skicka ansökan åt dig.",
    sources: [
      { name: "Hyresgästföreningen: kan hyresvärden kräva borgensman?", url: hyresgastforeningenBorgen },
      { name: "Jordabalken (1970:994), 12 kap. 28 a §", url: jordabalken },
      { name: "Boverket: kommunala hyresgarantier", url: boverketGaranti },
      { name: "Stockholms stad: kommunal hyresgaranti", url: stockholmBoende },
      { name: "Bostadsförmedlingen: borgen på ungdomslägenhet", url: bfRegler },
    ],
  },
  {
    slug: "inkomstintyg-och-dokument",
    title: "Inkomstintyg och dokument att ha redo",
    description:
      "Checklista över intyg hyresvärdar brukar be om: lönebesked, anställningsintyg, CSN, a-kassa, pension, företag och personbevis.",
    dek: "Ha legitimation, personbevis och intyg på inkomsten redo innan du tackar ja till en lägenhet.",
    summary:
      "När du får ett erbjudande går det ofta fort. Samla handlingarna innan, så att du inte missar svarstiden. Listan nedan följer det Bostadsförmedlingen skriver att hyresvärden brukar vilja se. Andra hyresvärdar kan be om färre papper, eller om andra.",
    sections: [
      {
        heading: "Checklista",
        paragraphs: ["Bocka av det som gäller dig. Lämna inte fler personuppgifter än hyresvärden ber om."],
        bullets: [
          "Legitimation: pass, nationellt id-kort eller körkort.",
          "Personbevis av den typ hyresvärden namnger.",
          "Anställning: de tre senaste lönebeskeden och ett anställningsintyg som är högst två månader gammalt.",
          "Studentbostad: studieintyg från Ladok, eller från skolan om den inte använder Ladok. Har terminen inte börjat kan ett antagningsbesked räcka.",
          "Pension: intyg från Pensionsmyndigheten och, om det behövs, från bolaget som betalar tjänstepensionen.",
          "A-kassa: beslutet som visar att du är beviljad ersättning, och hur många dagar du har. Ett medlemsbevis om hyresvärden ber om det.",
          "Sjukersättning eller annan ersättning från Försäkringskassan: beslutet som visar belopp och period. Fråga om hyresvärden räknar det.",
          "CSN: beslut eller utbetalningar som visar vad du får. De kommunala bolagen räknar studiebidrag, inte automatiskt hela lånet.",
          "Egen firma eller aktiebolag: deklaration, registreringsbevis, bokslut, balans- och resultatrapport och revisorsintyg, enligt listan hos Bostadsförmedlingen.",
          "Sparande: kontoutdrag eller bankintyg, om hyresvärden har sagt att de vill se det.",
          "Nuvarande boende: säg inte upp hyresavtalet förrän den nya hyresvärden har godkänt dig.",
        ],
      },
      {
        heading: "Vad anställningsintyget ska innehålla",
        paragraphs: [
          "Bostadsförmedlingen har en konkret lista för anställningsintyget. Be arbetsgivaren skriva det på papper eller i en fil som går att visa, och se till att personen som skriver under anger sin befattning och sina kontaktuppgifter.",
        ],
        bullets: [
          "Ditt för- och efternamn och ditt personnummer.",
          "Titel, anställningsdatum och arbetsort.",
          "Arbetsgivarens namn och organisationsnummer.",
          "Anställningsform. Vid tidsbegränsad anställning: slutdatum. Vid timanställning: timmar och timlön.",
          "Sysselsättningsgrad i procent.",
          "Beräknad årsinkomst, med ob- och semesterersättning om du har det.",
          "Datum, ort, underskrift, befattning och kontaktuppgifter till den som intygar.",
        ],
      },
      {
        heading: "Inkomstuppgifter från Skatteverket",
        paragraphs: [
          "Ber Bostadsförmedlingen dig styrka utbetalningar gör du det med skärmbilder från Mina sidor hos Skatteverket. Logga in med e-legitimation, öppna Skatter och sedan Mina inkomstuppgifter. Välj utbetalare, månad och år, och öppna övrig information så att personnumret syns. Ta en bild per månad de ber om, ofta de tre senaste.",
          "Det är inte samma sak som ett personbevis, och inte samma sak som arbetsgivarintyget till a-kassan. Tre olika mottagare kan vilja ha tre olika papper.",
        ],
      },
      {
        heading: "Det du inte ska göra i förväg",
        paragraphs: [
          "Köp inte en kreditupplysning på dig själv förrän hyresvärden ber om en kopia. De flesta tar upplysningen själva.",
          "Säg inte upp bostaden du har, och sälj den inte, förrän du är godkänd. De kommunala bolagen godtar inte dubbelt boende, men de vill att uppsägningen sker när du faktiskt fått den nya lägenheten. Äger du en bostadsrätt eller villa kan de i stället vilja se ett uppdragsavtal med en mäklare.",
        ],
      },
    ],
    steps: [
      "Gör en mapp, på papper eller i telefonen, med legitimation och personbevis.",
      "Be arbetsgivaren om ett aktuellt anställningsintyg och spara de tre senaste lönebeskeden.",
      "Har du ingen lön: spara beslutet från CSN, a-kassan, Försäkringskassan eller Pensionsmyndigheten.",
      "Driver du företag: plocka fram deklaration, registreringsbevis och senaste bokslutet i god tid. Revisorsintyg tar längre tid än ett lönebesked.",
      "När erbjudandet kommer, skicka bara det hyresvärden listar, och kontrollera att namn och personnummer syns.",
    ],
    related: ["bestall-personbevis", "vad-hyresvardar-kraver", "hyra-forstahand-utan-fast-inkomst"],
    cta: "Med intygen samlade går en ansökan snabbare. Blixtbo kan skicka profilen du redan fyllt i. Hyresvärden avgör om underlaget räcker.",
    sources: [
      { name: "Bostadsförmedlingen: visa intyg", url: bfIntyg },
      { name: "Bostadsförmedlingen: vad som räknas som inkomst", url: bfRegler },
      { name: "Skatteverket: personbevis", url: skatteverketPersonbevis },
    ],
  },
  {
    slug: "betalningsanmarkning",
    title: "Betalningsanmärkning – vad du kan göra",
    description:
      "Vad en betalningsanmärkning är, när den uppstår, hur länge den finns kvar för en privatperson och vad du kan göra när du söker hyresrätt.",
    dek: "En betalningsanmärkning försvinner inte för att du betalar skulden. Den ligger kvar en tid.",
    summary:
      "En betalningsanmärkning är en uppgift hos ett kreditupplysningsföretag om att en skuld inte betalades i tid. För en privatperson ligger den kvar i tre år. Att betala skulden efteråt tar inte bort den. Du kan ändå söka bostad: en del hyresvärdar gör en egen bedömning om skulden är betald eller om du har en säkerhet.",
    sections: [
      {
        heading: "När anmärkningen uppstår",
        paragraphs: [
          "Konsumentverket och Integritetsskyddsmyndigheten beskriver samma kedja. Ett inkassokrav är inte en betalningsanmärkning. En ansökan om betalningsföreläggande hos Kronofogden är inte heller en anmärkning för dig som privatperson.",
          "Anmärkningen kommer om Kronofogden meddelar ett utslag, för att du varken betalade eller protesterade i tid. Hamnar saken i tingsrätten och du följer domen och betalar, blir det ingen anmärkning av det. Struntar du i stämningen kan en tredskodom däremot leda till en anmärkning.",
          "Får du ett brev från Kronofogden: betala eller bestrid inom den tid som står i brevet. Gör du ingenting kan utslaget, och sedan anmärkningen, komma även om kravet var fel.",
        ],
      },
      {
        heading: "Hur länge den finns kvar",
        paragraphs: [
          "För en privatperson finns betalningsanmärkningen kvar i tre år, räknat från den händelse som registrerades, till exempel datumet för Kronofogdens utslag. Det skriver både Kronofogden, Konsumentverket och Integritetsskyddsmyndigheten.",
          "Betalar du skulden efter utslaget står anmärkningen kvar. Syftet med uppgiften är att visa att betalningen inte skedde i tid. Den som utlovar att en korrekt anmärkning kan raderas mot en avgift beskriver något som reglerna inte ger.",
          "Vid skuldsanering gäller andra tider. Kronofogden skriver att uppgiften då finns kvar i fem år från att skuldsaneringen inleddes, eller tills betalningsplanen är klar om den pågår längre. Läs Kronofogdens sida om det gäller dig, i stället för att räkna med tre år.",
          "För ett företag är tiden en annan, oftast fem år. Den här guiden handlar om dig som privatperson.",
        ],
      },
      {
        heading: "Så påverkar det bostadssökandet",
        paragraphs: [
          "Konsumentverket nämner hyreskontrakt, lån och abonnemang som sådant som kan bli svårare. Hyresvärden ser anmärkningen i kreditupplysningen.",
          "De kommunala bolagen i Stockholm skriver att en skuld hos Kronofogden ska vara betald, eller ingå i frivilliga inbetalningar, löneutmätning eller skuldsanering som fungerat i minst sex månader utan avbrott. Nya skulder eller nya anmärkningar får inte ha tillkommit. Anmärkningar kopplade till ett tidigare boende godtas inte.",
          "Andra hyresvärdar kan säga nej direkt, eller be om borgen eller en kommunal hyresgaranti. Stockholms stads hyresgaranti kräver att anmärkningen inte har tillkommit de senaste tolv månaderna.",
        ],
      },
      {
        heading: "Vad du kan göra",
        paragraphs: [
          "Du har ingen rätt att bli struken ur kreditupplysningsregistret. Du har rätt att få felaktiga uppgifter rättade. Integritetsskyddsmyndigheten säger att du i första hand kontaktar kreditupplysningsföretaget.",
          "Du kan begära besked om vilka uppgifter ett företag har om dig. Informationen ska lämnas utan kostnad, så länge begäran inte är uppenbart ogrundad eller orimlig. Integritetsskyddsmyndigheten listar de rikstäckande företagen.",
        ],
        bullets: [
          "Betala eller bestrid ett krav från Kronofogden i tid, så att du inte får en ny anmärkning.",
          "Betala kvarvarande skuld om du kan, och spara kvittot. Anmärkningen ligger kvar, men en del hyresvärdar väger in att skulden är reglerad.",
          "Är uppgiften fel: skriv till kreditupplysningsföretaget och be dem rätta den. Utgå från hur det såg ut när anmärkningen uppstod.",
          "Berätta för hyresvärden hur det ligger till, i stället för att hoppas att upplysningen missar posten. Fråga om borgen eller hyresgaranti godtas.",
          "Behöver du hjälp med skulderna: kontakta budget- och skuldrådgivningen i din kommun. Konsumentverket beskriver vägen vid skulder och skuldsanering.",
        ],
      },
    ],
    steps: [
      "Ta reda på om du har en anmärkning genom att fråga ett kreditupplysningsföretag, inte genom att gissa.",
      "Får du post från Kronofogden: betala eller protestera inom tiden i brevet.",
      "Betala skulden om den stämmer, och spara underlaget. Räkna med att anmärkningen ligger kvar i tre år.",
      "Be att en felaktig uppgift rättas hos kreditupplysningsföretaget.",
      "När du söker bostad: var öppen med läget och fråga vilka säkerheter hyresvärden godtar.",
      "Ta hjälp av kommunens budget- och skuldrådgivning om skulderna är svåra att reda ut själv.",
    ],
    related: ["vad-hyresvardar-kraver", "borgen", "hyra-forstahand-utan-fast-inkomst"],
    cta: "Blixtbo ser inte din kreditupplysning och kan inte lova att en hyresvärd säger ja. Tjänsten kan bevaka lägenheter och skicka ansökan dit kraven går att läsa i förväg.",
    sources: [
      { name: "Kronofogden: hur länge en betalningsanmärkning finns kvar", url: kronofogdenAnmarkning },
      { name: "Integritetsskyddsmyndigheten: betalningsanmärkningar", url: imyAnmarkning },
      { name: "Integritetsskyddsmyndigheten: vad som står i registren", url: imyRegister },
      { name: "Konsumentverket: inkasso och betalningsanmärkning", url: konsumentverketInkasso },
      { name: "Konsumentverket: skulder och skuldsanering", url: konsumentverketSkulder },
      { name: "Bostadsförmedlingen: kreditvärdighet hos de kommunala bolagen", url: bfRegler },
    ],
  },
  {
    slug: "bostadskoer-stockholm",
    title: "Bostadsköer i Stockholm",
    description:
      "Vilka bostadsköer som finns i Stockholm, vad Bostadsförmedlingen och studentkön kostar, och hur du behåller din plats.",
    dek: "I Stockholm finns den kommunala kön, studentköer och hyresvärdarnas egna köer. Avgifter och regler skiljer sig.",
    summary:
      "Det finns inte en enda kö. Bostadsförmedlingen är Stockholms stads kö och kostar 200 kronor om året. Stockholms studentbostäder har en egen kö som är gratis, men med krav på studier och kårmedlemskap. Privata hyresvärdar har egna köer eller portaler, med egna avgifter och egna krav på att du håller kontot vid liv.",
    sections: [
      {
        heading: "Bostadsförmedlingen",
        paragraphs: [
          "Stockholms stad förmedlar hyresrätter genom Bostadsförmedlingen, tillsammans med både kommunala och privata fastighetsägare. Du söker själv bland annonserna. För vanliga lägenheter är det kötiden bland dem som anmält intresse som avgör. Nyproduktion har ofta kortare kötid, särskilt när många lägenheter förmedlas samtidigt.",
          "Du kan registrera dig från 18 år om du har svenskt personnummer eller samordningsnummer. Det spelar ingen roll var du bor. Kötiden börjar dagen du registrerar dig. Den är personlig och kan i normalfallet inte ges bort.",
          "Årsavgiften är 200 kronor. Du betalar med kort, Swish, avi eller e-faktura, en gång om året. Efter förfallodagen blir ärendet vilande: dina intresseanmälningar tas bort och du kan inte göra nya. Betalar du inom fem månader från förfallodagen aktiveras kontot igen och kötiden är kvar. Betalar du inte inom de fem månaderna avregistreras du, och kötiden går inte att få tillbaka. Obetald avgift skickas inte till inkasso, eftersom kön är frivillig. Du förlorar alltså platsen, inte genom en skuld, utan genom att kontot stängs.",
          "Logga in på Mina sidor och håll e-post och adress aktuella. Avin, påminnelser och bostadserbjudanden går dit. Det är betalningen som avgör om du får vara kvar, men utan att logga in är det lätt att missa både avin och ett erbjudande.",
          "Vissa kontrakt nollställer kötiden: tillsvidarekontrakt, seniorbostad 55+ och ungdomslägenhet med tillsvidarekontrakt. Kötiden är kvar vid korttidskontrakt, seniorbostad 65+, studentbostad, ungdomslägenhet på kort tid och det som kallas Bostad snabbt. Läs den aktuella listan innan du tackar ja, om du vill fortsätta samla tid.",
          "En medboende måste själv lägga till sig på ditt konto. En del hyresvärdar låter er då räkna ihop inkomsterna. Får ni en bostad tillsammans är det din kötid, som huvudsökande, som nollställs. Medboendens egen kö påverkas inte, om hen har ett eget konto.",
          "Har du redan kontrakt hos ett av Stockholms kommunala bostadsbolag kan du aktivera den interna byteskön. Det är en annan kö än den vanliga.",
        ],
      },
      {
        heading: "Studentköer",
        paragraphs: [
          "Stockholms studentbostäder, SSSB, har en egen kö. Den är gratis. För att samla mer än 90 ködagar behöver du vara aktiv student och medlem i en studentkår som är ansluten till SSCO. Kåren registrerar medlemskapet. Samma e-post och personnummer måste finnas hos kåren och hos SSSB, annars syns det inte.",
          "Har du inget registrerat kårmedlemskap alls behöver du själv parkera köplatsen inom 90 dagar från registreringen. Annars raderas den. En parkerad plats samlar inga nya dagar, men de dagar du har är kvar. Platsen kan vara parkerad i högst 36 månader. Därefter raderas ködagarna.",
          "Kön har fler regler: du ska fylla minst 17 och högst 60 år under året, avtal tecknas inte med någon under 18, och köplatsen kan inte överlåtas. För att göra en intresseanmälan under terminen behövs registreringsintyg och aktivt kårmedlemskap. Studierna ska vara på minst halvfart vid ett lärosäte anslutet till SSCO. När SSSB har signerat ett avtal raderas ködagarna. Logga in på Mina sidor om du vill aktivera kön igen efteråt.",
          "Bostadsförmedlingen har också studentlägenheter, med egna studiekrav. Där ligger lägenheterna i den vanliga kön, med den vanliga årsavgiften. Ett studentkontrakt där nollställer inte kötiden.",
        ],
      },
      {
        heading: "Hyresvärdarnas egna köer och portaler",
        paragraphs: [
          "Många privata hyresvärdar har en kö på sin egen webbplats. Andra lägger annonser i en portal. HomeQ är en sådan portal och uppger att det är gratis att registrera sig. Urvalet där kan vara köpoäng, först till kvarn eller lottning, beroende på hyresvärden.",
          "Det finns ingen gemensam regel för årsavgift eller för hur ofta du måste logga in. En del köer tar betalt varje år. Andra är gratis men kräver att du bekräftar kontot eller söker med jämna mellanrum. Missar du det som just den kön kräver kan dagarna försvinna. Läs villkoren när du registrerar dig, och lägg en påminnelse den dag avgiften eller bekräftelsen ska in.",
          "Ett konto i en kö ger dig inte plats i de andra. Registrera dig i de köer som har lägenheter där du kan tänka dig att bo, och håll var och en vid liv för sig.",
        ],
      },
    ],
    steps: [
      "Registrera dig hos Bostadsförmedlingen om du har fyllt 18 år och har personnummer eller samordningsnummer. Betala 200 kronor.",
      "Spara en påminnelse ett par veckor före nästa årsavgift. Logga in och kolla att e-posten stämmer, även om du inte söker just den veckan.",
      "Har du missat en betalning: betala så snart du kan. Efter fem månader från förfallodagen är kötiden borta.",
      "Studerar du: registrera dig även i studentkön, och se till att kårmedlemskapet syns. Parkera platsen inom 90 dagar om du ännu inte är medlem.",
      "Öppna hyresvärdarnas egna köer en och en. Skriv upp avgift, och om du måste logga in eller förnya för att dagarna ska vara kvar.",
      "Anmäl intresse på lägenheter du faktiskt vill ha. Bara att stå registrerad ger inget erbjudande.",
    ],
    related: ["hyra-forstahand-utan-fast-inkomst", "vad-hyresvardar-kraver", "forstahand-andrahand-och-bedragerier"],
    cta: "Köerna är en väg. En del lägenheter går till den som ansöker först, utan att kötiden avgör. Blixtbo bevakar sådana annonser och kan skicka ansökan. Kön ersätter tjänsten inte, och tjänsten ersätter inte kön.",
    sources: [
      { name: "Bostadsförmedlingen: registrera dig", url: bfRegistrera },
      { name: "Bostadsförmedlingen: köavgiften", url: bfAvgift },
      { name: "Bostadsförmedlingen: frågor och svar, bland annat om kötid", url: bfFaq },
      { name: "Stockholms stad: skaffa bostad", url: stockholmBoende },
      { name: "Stockholms studentbostäder: vanliga frågor", url: sssbFaq },
      { name: "Stockholms studentbostäder: köregler", url: sssbRegler },
      { name: "HomeQ: lediga lägenheter i Stockholm", url: homeq },
    ],
  },
  {
    slug: "forstahand-andrahand-och-bedragerier",
    title: "Förstahand, andrahand och hyresbedrägerier",
    description:
      "Skillnaden mellan förstahands- och andrahandskontrakt för en hyresrätt, och hur du kontrollerar uthyraren innan du betalar.",
    dek: "Förstahand är ditt avtal med hyresvärden. Andrahand kräver tillstånd, och förskott innan visning är en varningssignal.",
    summary:
      "Med ett förstahandskontrakt hyr du av den som äger huset. I andra hand hyr du av någon som själv hyr eller äger, och den personen behöver tillstånd. Skriftligt avtal, visning och en kontroll mot fastighetsägaren skyddar dig. Betala inte hyra i förväg till någon du inte har träffat.",
    sections: [
      {
        heading: "Förstahand",
        paragraphs: [
          "Hyresgästföreningen beskriver förstahand så här: du hyr bostaden direkt av hyresvärden, utan en mellanhand. Avtalet gäller ofta tills vidare. Du har då i normalfallet besittningsskydd från första dagen, vilket betyder att hyresvärden behöver en grund för att avtalet ska upphöra. Skyddet kan brytas om du till exempel inte betalar hyran eller missköter bostaden.",
          "Korttid och andra tillfälliga förstahandskontrakt är ett undantag. Där är besittningsskyddet ofta avtalat bort, i en egen handling. Läs om avtalet tar slut ett visst datum, och om du har skrivit på ett avstående.",
          "Du har rätt till ett skriftligt hyresavtal. Be om det även om samtalet kändes tydligt.",
        ],
      },
      {
        heading: "Andrahand",
        paragraphs: [
          "Hyr du en hyreslägenhet i andra hand är förstahandshyresgästen din hyresvärd. Det är den personen du vänder dig till. Konsumentverket påpekar att andra regler gäller om du hyr en bostadsrätt, villa, ägarlägenhet eller ett rum.",
          "Förstahandshyresgästen behöver tillstånd från sin hyresvärd, eller från hyresnämnden, för att hyra ut till någon som ska använda lägenheten självständigt. Utan tillstånd kan uthyrningen vara otillåten. Då kan du tvingas flytta, och den som hyr ut kan förlora sitt kontrakt. Be att få se tillståndet. Det gäller den person som ansökan avsåg, och det gäller en viss tid.",
          "Hyresnämnden kan ge tillstånd om det finns beaktansvärda skäl, om hyresvärden inte har befogad anledning att säga nej, och om hyran är skälig. Ansökan är skriftlig och kostnadsfri. Vanliga skäl är studier eller arbete på annan ort, en längre tid utomlands, att provbo med någon, eller vård.",
          "Hyran för en hyreslägenhet i andra hand ska vara skälig. Ofta är det samma hyra som förstahandshyresgästen betalar. Är lägenheten möblerad får påslaget vara högst 15 procent, enligt Konsumentverket. Tillägg för till exempel internet eller parkering får inte vara högre än det förstahandshyresgästen själv betalar. Tycker du att hyran är för hög kan hyresnämnden pröva den. Återbetalning kan gälla upp till två år tillbaka.",
          "För ett andrahandsavtal på obestämd tid är huvudregeln tre månaders uppsägningstid. Avtalet kan säga något annat, så läs det. Säger förstahandshyresgästen upp sitt eget avtal, eller blir vräkt, kan du behöva flytta även under din uppsägningstid. Merkostnader kan du i så fall kräva av den du hyr av, om du kan visa dem.",
          "Efter två år kan du få besittningsskydd mot förstahandshyresgästen. Det ger dig inte rätt att ta över förstahandskontraktet. Hyr du en bostadsrätt eller villa i andra hand har du enligt Hyresgästföreningen inte det besittningsskyddet. Inneboende, när du delar bostaden med den som bor där, är inte samma sak som andrahand och ger inte besittningsskydd.",
        ],
      },
      {
        heading: "Så undviker du ett hyresbedrägeri",
        paragraphs: [
          "Polisen beskriver lägenhetsbedrägerier som vanliga där det är ont om bostäder. Annonsen har ofta en attraktiv adress och en hyra som ser rimlig ut. Bedragaren vill ha flera hyror i förskott eller i deposition, ibland utan att träffa dig. Bilder kan vara kopierade från en försäljningsannons.",
        ],
        bullets: [
          "Kontrollera med fastighetsägaren att personen som hyr ut verkligen förfogar över lägenheten och, vid andrahand, har tillstånd. Slå upp telefonnumret själv.",
          "Klicka inte på länkar i mejl eller sms till \"hyresvärden\". Bedragare bygger falska sidor. Polisen avråder också från att logga in med BankID för att någon som kontaktar dig ber om det, och från att lämna ut koder eller kortuppgifter.",
          "Kräv legitimation och ett skriftligt kontrakt.",
          "Se lägenheten innan du betalar. Ta med en vän. Att någon är utomlands och ändå vill ha förskott är en varningssignal.",
          "Betala inte via anonyma betalningstjänster, och betala inte för att reservera en lägenhet du inte har sett.",
          "Blir du stressad av att \"någon annan tar den i kväll\" är det ett skäl att stanna upp, inte att skynda.",
        ],
      },
      {
        heading: "Om du redan har betalat",
        paragraphs: [
          "Kontakta banken först, så att de kan försöka stoppa betalningen. Gör sedan en polisanmälan på 114 14, eller besök en polisstation. Ring 112 om brottet pågår.",
        ],
      },
    ],
    steps: [
      "Avgör om annonsen är förstahand hos en hyresvärd, eller andrahand hos en privatperson.",
      "Vid andrahand: be att få se tillståndet från hyresvärden eller hyresnämnden, och kontrollera uppgiften hos fastighetsägaren själv.",
      "Gå på visning. Ta med någon. Be om legitimation.",
      "Läs det skriftliga avtalet: hyra, tid, uppsägning och om besittningsskyddet är avtalat bort.",
      "Betala först när du har sett lägenheten och avtalet är påskrivet. Inte till ett konto du inte kan koppla till uthyraren.",
      "Logga inte in med BankID på uppmaning av någon som hör av sig, och klicka inte på länkar i mejlet.",
      "Misstänker du bedrägeri: ring banken, och anmäl sedan till polisen.",
    ],
    related: ["bostadskoer-stockholm", "hyra-forstahand-utan-fast-inkomst", "betalningsanmarkning"],
    cta: "Blixtbo bevakar hyresvärdarnas annonser om förstahand, inte privata andrahandsannonser. Tjänsten skickar din ansökan. Den tar inte emot hyra och skriver inte kontraktet.",
    sources: [
      { name: "Hyresgästföreningen: förstahandskontrakt", url: hyresgastforeningenForstahand },
      { name: "Hyresgästföreningen: besittningsskydd", url: hyresgastforeningenBesittning },
      { name: "Hyresgästföreningen: hyra lägenhet i andra hand", url: hyresgastforeningenAndrahand },
      { name: "Hyresgästföreningen: hyra ut i andra hand", url: hyresgastforeningenUthyrning },
      { name: "Konsumentverket: hyra hyreslägenhet i andra hand", url: konsumentverketAndrahand },
      { name: "Sveriges Domstolar: ansök om godkännande av andrahandsuthyrning", url: domstolAndrahand },
      { name: "Polisen: annonsbedrägeri", url: polisenAnnons },
      { name: "Polisen: skydd mot bedrägerier, bland annat BankID", url: polisenBankid },
    ],
  },
];

export function guideBySlug(slug: string) {
  return guides.find((guide) => guide.slug === slug) ?? null;
}

export function guideHref(slug: string) {
  return `/guider/${slug}`;
}

export function paragraphParts(paragraph: Paragraph): TextPart[] {
  return typeof paragraph === "string" ? [paragraph] : paragraph;
}

export function textOf(parts: TextPart[]) {
  return parts.map((part) => (typeof part === "string" ? part : part.label)).join("");
}

export function guidePlainText(guide: Guide) {
  const chunks = [guide.title, guide.description, guide.dek, guide.summary, guide.cta, ...guide.steps];
  for (const section of guide.sections) {
    chunks.push(section.heading);
    for (const paragraph of section.paragraphs) chunks.push(textOf(paragraphParts(paragraph)));
    if (section.bullets) chunks.push(...section.bullets);
  }
  for (const source of guide.sources) chunks.push(source.name, source.url);
  return chunks.join("\n");
}

export function guideSitemapEntries(): { url: string; lastModified: string; changeFrequency: "monthly"; priority: number }[] {
  return [
    {
      url: `${SITE_URL}/guider`,
      lastModified: GUIDE_UPDATED,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    ...guides.map((guide) => ({
      url: `${SITE_URL}${guideHref(guide.slug)}`,
      lastModified: GUIDE_UPDATED,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}

function openGraph(title: string, description: string, url: string, type: "website" | "article") {
  return {
    type,
    locale: "sv_SE",
    siteName: "Blixtbo",
    url,
    title,
    description,
    ...(type === "article" ? { publishedTime: GUIDE_UPDATED, modifiedTime: GUIDE_UPDATED } : {}),
  };
}

export function guidesIndexMetadata(): Metadata {
  const title = "Guider om att hyra bostad";
  const description =
    "Praktiska guider om att söka hyresrätt: inkomst, personbevis, hyresvärdens krav, borgen, dokument, betalningsanmärkning, köer i Stockholm och hur du undviker bedrägerier.";
  return {
    title,
    description,
    alternates: { canonical: "/guider" },
    openGraph: openGraph(`${title} | Blixtbo`, description, "/guider", "website"),
    twitter: { card: "summary_large_image", title: `${title} | Blixtbo`, description },
  };
}

export function guideMetadata(guide: Guide): Metadata {
  const url = guideHref(guide.slug);
  const titled = `${guide.title} | Blixtbo`;
  return {
    title: guide.title,
    description: guide.description,
    alternates: { canonical: url },
    openGraph: openGraph(titled, guide.description, url, "article"),
    twitter: { card: "summary_large_image", title: titled, description: guide.description },
  };
}

export function guidesIndexJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Guider om att hyra bostad",
    url: `${SITE_URL}/guider`,
    inLanguage: "sv",
    isPartOf: { "@id": `${SITE_URL}/#website` },
    description:
      "Praktiska guider om att söka hyresrätt: inkomst, personbevis, hyresvärdens krav, borgen, dokument, betalningsanmärkning, köer i Stockholm och hur du undviker bedrägerier.",
    mainEntity: {
      "@type": "ItemList",
      itemListElement: guides.map((guide, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: guide.title,
        url: `${SITE_URL}${guideHref(guide.slug)}`,
      })),
    },
  };
}

export function guideArticleJsonLd(guide: Guide) {
  const url = `${SITE_URL}${guideHref(guide.slug)}`;
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: guide.title,
    description: guide.description,
    inLanguage: "sv",
    datePublished: GUIDE_UPDATED,
    dateModified: GUIDE_UPDATED,
    mainEntityOfPage: url,
    url,
    author: { "@type": "Organization", name: "Blixtbo", url: SITE_URL },
    publisher: {
      "@type": "Organization",
      name: "Blixtbo",
      url: SITE_URL,
      logo: { "@type": "ImageObject", url: `${SITE_URL}/icon-512.png` },
    },
  };
}

export function guideBreadcrumbJsonLd(guide: Guide) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Blixtbo", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Guider", item: `${SITE_URL}/guider` },
      { "@type": "ListItem", position: 3, name: guide.title, item: `${SITE_URL}${guideHref(guide.slug)}` },
    ],
  };
}
