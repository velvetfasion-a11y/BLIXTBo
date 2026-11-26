# Blixtbo

Svensk app för att hinna först till förstahandskontrakt, och för att hålla koll på ansökningar och bostadsköer. Exempelkontot ligger kvar i webbläsaren. Riktig inloggning går via Firebase Authentication (Google). Ansökningar, svep, erbjudanden, köer och HomeQ-gränser sparas i Firestore.

Worker-processen (Playwright och Hugging Face) körs kvar i Docker. Den läser och skriver Firestore med ett servicekonto, Admin SDK. Den krypterar hyresvärdens inloggning med `WORKER_KEK` innan något sparas. BankID sparas aldrig.

## Köra lokalt

```bash
npm install
npm run dev
```

Appen ligger på [http://127.0.0.1:43123](http://127.0.0.1:43123).

## Firebase (det här gör du själv i konsolen)

1. Gå till [Firebase console](https://console.firebase.google.com/) och skapa ett projekt. Välj ett namn, till exempel `blixtbo`. Du behöver inget betalabonnemang för Auth och Firestore i liten skala.
2. I projektet: **Build → Authentication → Get started**. Öppna fliken **Sign-in method** och aktivera **Google**. Välj ett supportmejl.
3. Under **Authentication → Settings → Authorized domains**, lägg till domänen där appen ska ligga (till exempel `blixtbo.web.app` eller din egen domän). `localhost` finns redan.
4. **Build → Firestore Database → Create database**. Välj en region nära Sverige. Starta i **production mode**. Reglerna i `firestore.rules` i det här repot ersätter standardreglerna när du deployar.
5. **Project settings** (kugghjulet) → **Your apps** → lägg till en **Web app**. Kopiera värdena till `.env.local` (samma namn som i `.env.example`): `NEXT_PUBLIC_FIREBASE_API_KEY`, `AUTH_DOMAIN`, `PROJECT_ID`, `APP_ID`, `MESSAGING_SENDER_ID`, `STORAGE_BUCKET`.
6. **Project settings → Service accounts → Generate new private key**. Öppna JSON-filen. Lägg hela JSON på en rad i `FIREBASE_SERVICE_ACCOUNT` i `server/.env` på Docker-maskinen. Lägg samma projekt-id i `FIREBASE_PROJECT_ID`. Radera den nedladdade filen från din dator när värdet ligger i `.env`. Den filen får inte in i git.
7. Sätt `OWNER_GOOGLE_EMAIL` till det Google-konto som ensam får öppna `/internal/ops`. Det kontot loggar in med Firebase som alla andra, och måste dessutom ange TOTP-koden. API:t kontrollerar ID-token med Admin SDK och jämför mejlet.
8. Deploya regler och index: `npx firebase-tools deploy --only firestore:rules,firestore:indexes`. Frontend deployas med Firebase App Hosting (`apphosting.yaml` och `firebase.json`). Worker-containern startas som tidigare med `docker compose` i `server/`, med `DATA_BACKEND=firestore` och `LANDLORD_MODE=dry-run`.

Så pratar de: webbläsaren skriver användarens egna dokument med Firebase-klienten. Worker och API använder servicekontot och går förbi reglerna. `credentials` kan bara servicekontot läsa. `config` kan inloggade användare läsa, men bara servern skriva.

## Stripe

Premium kostar **99 kr/mån** från start. Beloppet styrs av `PREMIUM_PRICE_KR`. Det finns ingen 149-kronorsnivå och ingen rabattkod.

1. Skapa ett konto på [Stripe](https://dashboard.stripe.com/register). Använd testläge (`sk_test_` / `rk_test_` / `pk_test_`) tills du vill ta betalt på riktigt. Live-nycklar (`sk_live_` / `rk_live_` / `pk_live_`) fungerar i samma kod. En begränsad nyckel (`rk_`) är att föredra framför en hemlig nyckel (`sk_`). Lägg aldrig nyckeln i git.
2. **Developers → API keys**. Kopiera den hemliga eller begränsade nyckeln till `STRIPE_SECRET_KEY` i `server/.env`, och den publika (`pk_test_...` eller `pk_live_...`) till `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` i `.env.local`. Tomma och felaktiga nycklar avvisas. En testnyckel och en live-nyckel hör till var sitt läge: pris, kunder och webhook måste finnas i det läge nyckeln tillhör.
3. Kör `python3 scripts/stripe_setup.py` med nyckeln satt. Skriptet skapar, om de saknas, produkten Blixtbo Premium, priset 99 kr/mån (lookup key `blixtbo_premium_monthly`) och webhooken `https://blixtbo.se/api/billing/webhook`. En andra körning återanvänder samma id:n och skriver ut dem. Nyckeln skrivs inte ut. Sätt `STRIPE_PRICE_ID` till prisets id. Kopiera webhookens signeringshemlighet (`whsec_...`) från Stripe till `STRIPE_WEBHOOK_SECRET`. Händelserna är `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.trial_will_end`, `invoice.paid`, `invoice.payment_failed`, `setup_intent.succeeded`, `payment_intent.succeeded` och `checkout.session.completed`.

Kortet, Apple Pay och Google Pay visas i appens eget ark. Ingen omdirigering till Stripe Checkout. Webhooken skriver `users/{uid}/billing/entitlement`. Paus och avslut är knappar i appen.

## Emulatorer

```bash
npx firebase-tools emulators:start --only auth,firestore
```

Sätt `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true` och fyll i en webbkonfig med projekt-id `blixtbo-dev` (nycklarna behöver inte vara riktiga mot emulatorn). `npm run dev` och **Fortsätt med Google** loggar in mot Auth-emulatorn.

## Statisk export

```bash
npm run build
npx serve out
```

App Hosting bygger Next.js utan statisk export, så `npm run pack` kräver att du tillfälligt sätter `output: "export"` om du fortfarande vill ha en enda HTML-fil.

En enda fil, utan server:

```bash
npm run build
npm run pack
```

Det skapar `blixtbo.html`. Öppna den direkt i webbläsaren. Exempelkontot finns på första sidan, och admin under Profil eller via `#/admin`.

## Så här ser man flödet

- **Skapa konto** går via ett simulerat BankID eller e-post, och sedan en profilguide.
- **Öppna exempelkonto** på första sidan hoppar till ett ifyllt konto med annonser, ansökningar, köer och notiser.
- **Admin** finns under Profil, eller direkt på `/admin`.
- **Egen hyresvärd** finns under Hyresvärdar. Bara ett namn räcker. Sidan bekräftas innan den används, och utan en färdig koppling visas Ansök själv.

Varumärket är en platshållare och byts genom att söka på `Blixtbo`.
