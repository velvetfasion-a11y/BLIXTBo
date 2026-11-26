# App Review notes

Paste the English block into App Store Connect → App Review Information → Notes. The Swedish block is the same text for Julia. Do not submit the build until the steps in `docs/ios-release.md` are done, and do not put a real landlord password in the demo account.

## English (paste this)

Blixtbo does not own, rent, or broker apartments. It helps a signed-in person watch rental listings and keep track of their own applications.

Landlord logins are voluntary. The user types their own username and password for a third-party landlord site. The iOS app sends that password only over HTTPS to the existing API, which seals it before storage. The password is not written to UserDefaults, AsyncStorage, or the Keychain. BankID is never collected. If a landlord requires BankID, the app tells the person to do that on the landlord’s own site.

The worker can re-check a saved login (keep-alive). In the build you review, the server must stay in `LANDLORD_MODE=dry-run`. Dry-run does not open landlord sites and does not submit applications. Please do not enter a real landlord account.

Sign in with Apple uses the same Firebase project as blixtbo.se. Email and password also create a Firebase user in that project.

Blixtbo Premium is an auto-renewable subscription sold only with Apple In-App Purchase (StoreKit 2). There is no button or link to Stripe or any other checkout. Price shown in the app comes from StoreKit, with 99 SEK/month and a 3-day free trial as the configured offer. Restore Purchases is on the Premium screen. Cancellation is in iOS Settings → Apple ID → Subscriptions. Deleting the Blixtbo account does not cancel the Apple subscription; the deletion screen says so. Account deletion is inside the app (Inställningar), confirmation word RADERA, and does not require an email to support.

Demo account: use the Apple or email account created for review. It has no landlord credentials. After sign-in you can open Annonser, Ansökningar, Notiser, Hyresvärdar, Inställningar, and Premium. Push is optional.

Privacy policy: https://blixtbo.se/integritet
Terms: https://blixtbo.se/villkor
Support: https://blixtbo.se/hjalp and support@blixtbo.se

## Svenska

Blixtbo äger inte, hyr inte ut och förmedlar inte bostäder. Appen hjälper en inloggad person att se hyresannonser och hålla koll på sina egna ansökningar.

Hyresvärdens inloggning är frivillig. Användaren skriver sitt eget användarnamn och lösenord. Appen skickar lösenordet bara över HTTPS till befintligt API, som förseglar det innan det sparas. Lösenordet skrivs inte till UserDefaults, AsyncStorage eller Nyckelringen. BankID tas aldrig emot. Kräver hyresvärden BankID står det att personen gör det på hyresvärdens egen sida.

Servern kan kontrollera en sparad inloggning igen (keep-alive, enbart läsning av sessionen). Under granskningen ska `LANDLORD_MODE=dry-run`. Dry-run öppnar inte hyresvärdens sidor och skickar inga ansökningar. Ange inget riktigt hyresvärdskonto.

Logga in med Apple är samma Firebase-projekt som blixtbo.se. E-post och lösenord skapar också en Firebase-användare där.

Blixtbo Premium säljs bara som Apple-prenumeration (StoreKit 2). Det finns ingen länk till Stripe. Återställ köp finns på Premium-skärmen. Avslut görs i iOS-inställningarna. Radering av Blixtbo-kontot avslutar inte Apple-prenumerationen, och det står i appen. Radering startas i appen med ordet RADERA.

Demokontot ska sakna hyresvärdslösenord.
