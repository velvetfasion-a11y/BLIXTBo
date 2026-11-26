import { premiumPriceKr, trialDays } from "@/lib/billing";

export const SITE_URL = "https://blixtbo.se";

export const HOME_TITLE = "Lediga lägenheter i Stockholm – ansök först | Blixtbo";

export const HOME_DESCRIPTION =
  "Se lediga hyresrätter och förstahandskontrakt i Stockholm på ett ställe. Blixtbo bevakar annonserna och köerna och skickar din ansökan först.";

export const HOME_H1 = "Se alla lediga lägenheter på ett ställe – och ansök först";

export const HOME_SUBLINE =
  "Blixtbo bevakar hyresvärdarnas annonser och bostadsköer åt dig. Ett svep, så skickas din ansökan innan de andra hunnit läsa klart.";

export const HOME_SECTIONS = [
  {
    title: "Ha koll på alla bostäder och köer",
    body: "Nya hyresrätter och förstahandskontrakt hamnar överst, med de områden, den hyra och den storlek du valt. Under Koll ser du dina ansökningar, ködagar och när en kö behöver förnyas, så att du inte förlorar kötid.",
  },
  {
    title: "Ansök direkt – utan att fylla i allt om och om igen",
    body: "Du fyller i din profil en gång: yrke, inkomst, hushåll, personligt brev och dokument. Ett svep på en ledig lägenhet skickar ansökan med samma profil. Hyresvärden bestämmer vem som får lägenheten och skriver kontraktet med dig. Blixtbo gör att du hinner först med ansökan.",
  },
  {
    title: "Hyresrätter i Stockholm, där du vill bo",
    body: "Bevaka innerstan, Gärdet och Hjorthagen, Hammarby Sjöstad, Liljeholmen, Solna och Sundbyberg. Välj max hyra och våning, så får du bara lägenheter som passar.",
  },
] as const;

export const HOME_STEPS = [
  "Välj område, hyra och storlek.",
  "Fyll i din profil en gång.",
  "Svep på en ledig lägenhet för att skicka ansökan.",
  "Följ ansökningar och köer under Koll.",
] as const;

export function includedCopy() {
  const price = premiumPriceKr();
  const days = trialDays();
  return `Gratis: bevakning och ansökningar upp till ett tak. Premium: inga tak på automatiska ansökningar, ${price} kr/månad efter ${days} dagars prov. Avsluta när du vill under Inställningar.`;
}

export type FaqItem = { question: string; answer: string };

export function homeFaqs(): FaqItem[] {
  const price = premiumPriceKr();
  const days = trialDays();
  return [
    {
      question: "Var hittar jag lediga lägenheter i Stockholm?",
      answer:
        "Hyresvärdarna annonserar på sina egna sidor, hos Bostadsförmedlingen och på andra portaler. Blixtbo bevakar annonserna åt dig och visar nya lägenheter som matchar dina val, så du slipper kolla flera ställen själv.",
    },
    {
      question: "Hur får jag ett förstahandskontrakt i Stockholm?",
      answer:
        "De flesta förstahandskontrakt går via bostadskö, lottning eller först till kvarn. Ställ dig i köerna, bevaka nya annonser och ansök snabbt. Blixtbo hjälper dig bevaka köer och skicka ansökan snabbt. Hyresvärden väljer själv vem som får kontraktet.",
    },
    {
      question: "Kan jag hyra en lägenhet i Stockholm utan kö?",
      answer:
        "Ja, en del hyresvärdar delar ut lägenheter genom först till kvarn eller lottning, då spelar kötiden ingen roll. Blixtbo tar inte bort köer, men hjälper dig att hinna med de lägenheter som går utan kö.",
    },
    {
      question: "Hur fungerar bostadskön i Stockholm?",
      answer:
        "Du samlar kötid, oftast en dag per dag, hos Bostadsförmedlingen och hos andra hyresvärdar. Kötiden räknas först när du står i kön, och den kan försvinna om du inte förnyar medlemskapet. Blixtbo visar när en kö behöver förnyas.",
    },
    {
      question: "Hur lång tid tar det att få lägenhet i Stockholm?",
      answer:
        "Det varierar mycket. Förstahandskontrakt via kö kan ta flera år, men ansökningar utan kö går på dagar. Många annonser är borta efter några dagar, så snabb ansökan ökar chansen.",
    },
    {
      question: "Är Blixtbo en hyresvärd eller en bostadsförmedling?",
      answer:
        "Nej. Blixtbo äger inga lägenheter och förmedlar inte kontrakt. Vi bevakar hyresvärdarnas annonser och skickar din ansökan åt dig. Du skriver kontrakt direkt med hyresvärden.",
    },
    {
      question: "Kan jag hyra lägenhet utan inkomst?",
      answer:
        "Det är svårt. De flesta hyresvärdar kräver inkomst eller borgensman. Några har andra villkor, så läs kraven i annonsen innan du ansöker. Blixtbo lovar inte att du blir godkänd.",
    },
    {
      question: "Vad kostar Blixtbo?",
      answer: `Att bevaka och ansöka är gratis upp till ett tak. Premium kostar ${price} kr/månad efter ${days} dagars prov och tar bort taket. Du avslutar under Inställningar, Prenumeration.`,
    },
    {
      question: "Vilka områden kan jag söka i?",
      answer: "Innerstan, Gärdet och Hjorthagen, Hammarby Sjöstad, Liljeholmen, Solna och Sundbyberg. Fler områden kommer.",
    },
    {
      question: "Vad är skillnaden mellan första och andra hand?",
      answer:
        "Förstahandskontrakt är ditt eget kontrakt med hyresvärden. Andrahand är när någon som själv hyr lånar ut sin lägenhet, oftast tidsbegränsat. Blixtbo fokuserar på förstahandskontrakt.",
    },
  ];
}

export const PUBLIC_PATHS = ["/", "/hjalp"] as const;

export const PRIVATE_PATHS = [
  "/api",
  "/admin",
  "/hem",
  "/koll",
  "/profil",
  "/installningar",
  "/konto",
  "/bankid",
  "/guide",
  "/bostad",
  "/erbjudande",
  "/filter",
  "/kopplingar",
  "/notiser",
] as const;

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: "Blixtbo",
        url: SITE_URL,
        logo: `${SITE_URL}/icon-512.png`,
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: "Blixtbo",
        url: SITE_URL,
        inLanguage: "sv",
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
    ],
  };
}

export function webApplicationJsonLd() {
  const price = premiumPriceKr();
  const days = trialDays();
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Blixtbo",
    url: SITE_URL,
    applicationCategory: "LifestyleApplication",
    operatingSystem: "Web",
    inLanguage: "sv",
    description: HOME_DESCRIPTION,
    offers: [
      {
        "@type": "Offer",
        name: "Gratis",
        price: "0",
        priceCurrency: "SEK",
        description: "Bevakning och ansökningar upp till ett tak.",
        url: SITE_URL,
      },
      {
        "@type": "Offer",
        name: "Premium",
        price: String(price),
        priceCurrency: "SEK",
        description: `${price} kr per månad efter ${days} dagars provperiod.`,
        url: SITE_URL,
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: String(price),
          priceCurrency: "SEK",
          unitText: "månad",
          referenceQuantity: {
            "@type": "QuantitativeValue",
            value: "1",
            unitCode: "MON",
          },
        },
      },
    ],
  };
}

export function faqJsonLd(faqs: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}
