# iOS-release

The app lives in `apps/mobile`. It is an Expo / React Native client, not a web view. Nothing in this file creates the App Store record, the subscription, or a TestFlight submission. Julia does the steps below. Do not merge the pull request until she has read it.

Payments use StoreKit 2 through `expo-iap` (open source, no RevenueCat account). The server verifies App Store Server Notifications V2 locally and writes `users/{uid}/billing/entitlement` with `plan=premium`, `status` `active` or `trialing`, and `source=apple`. The website reads that same document. The iOS app has no Stripe button.

Product id, in both places, default `se.blixtbo.premium.monthly`:

- App: `EXPO_PUBLIC_APPLE_PRODUCT_ID`
- API: `APPLE_PRODUCT_ID`

Bundle id placeholder: `se.blixtbo.app`.

## 1. Apple Developer

1. Confirm the membership. An individual account shows a person’s name as the seller. Rensé Advisory as the seller needs an organization membership, a D-U-N-S number, and legal authority. The privacy policy and terms still name Rensé Advisory.
2. Identifiers → App IDs → register `se.blixtbo.app`.
3. Enable **Sign in with Apple** and **Push Notifications** on that App ID.
4. Profiles: an App Store distribution profile for `se.blixtbo.app` when you archive in Xcode. EAS can create this if you let it manage credentials.

Sign in with Apple on the phone uses the bundle id. The website’s Services ID stays as it is for the browser. In Firebase Authentication, turn on the Apple provider if it is not already on. Authorized domains must include `blixtbo.se`.

## 2. App Store Connect app record

1. My Apps → New App.
2. Platform iOS. Name **Blixtbo**. Primary language Swedish. Bundle ID `se.blixtbo.app`. SKU for example `blixtbo-ios`.
3. Do not submit for review.
4. Copy the numeric Apple ID into the API env as `APPLE_APP_APPLE_ID`. Until that is set, leave it at `0` and the notification check skips the id.
5. Paste the Swedish text from `docs/app-store-metadata.md`.
6. Privacy policy URL `https://blixtbo.se/integritet`. Support URL `https://blixtbo.se/hjalp`.
7. App Privacy: use `docs/app-privacy-labels.md`.
8. Age rating: use the notes in that same file. Not Kids.
9. Export compliance: the binary sets `ITSAppUsesNonExemptEncryption` to false. Answer that only standard HTTPS is used.
10. Review notes: paste the English block from `docs/app-review-notes.md`. Create a demo Firebase user with no landlord password. Keep `LANDLORD_MODE=dry-run` on the server you point the build at.

## 3. Subscription

1. App Store Connect → the app → Subscriptions → create a group, for example `Blixtbo Premium`.
2. Auto-renewable subscription.
3. Product ID `se.blixtbo.premium.monthly` (or the same value you put in both env vars).
4. Duration 1 month. Price 99 SEK for Sweden.
5. Introductory offer: free trial, 3 days. Eligibility: new subscribers.
6. Swedish localization. Display name **Blixtbo Premium**. Description: bevakning och ansökningar utan gratistaket. Do not say that Blixtbo rents out homes.
7. Review screenshot of the Premium screen, after a TestFlight build exists.
8. The Paid Apps agreement, tax, and banking must be accepted before a purchase works. Do that in App Store Connect. This repository does not do it.

## 4. Server notifications

In App Store Connect → the app → App Information → App Store Server Notifications:

- Production URL: `https://blixtbo.se/api/billing/apple/notifications`
- Sandbox URL: the same URL while one API serves both. The notification’s `environment` field is stored on the entitlement.
- Version: **Version 2**.

The Next.js app rewrites `/api/*` to the Python API. The route on the API is `POST /billing/apple/notifications`. Confirm `API_PROXY_URL` points at that API.

On the API host, in `server/.env`:

```bash
APPLE_BUNDLE_ID=se.blixtbo.app
APPLE_PRODUCT_ID=se.blixtbo.premium.monthly
APPLE_APP_APPLE_ID=0
```

Set `APPLE_APP_APPLE_ID` to the numeric id once the app record exists. Restart the API. No shared secret is required. Verification uses the Apple root certificates in `server/blixtbo/certs` and the `x5c` chain on the JWS.

The iOS app calls `GET /billing/apple/account-token` before a purchase and sends that UUID as StoreKit’s `appAccountToken`. After purchase or restore it posts the transaction JWS to `POST /billing/apple/transactions`. The notification updates the same Firestore document. A notification for an unknown token returns 503 so Apple retries.

## 5. APNs key

1. Apple Developer → Keys → create a key with **Apple Push Notifications service (APNs)**.
2. Download the `.p8` once. Store it outside git.
3. Put it on the API host:

```bash
APNS_KEY_ID=the key id
APNS_TEAM_ID=the team id
APNS_KEY_P8=/path/to/AuthKey.p8
APNS_USE_SANDBOX=true
```

`APNS_KEY_P8` may instead be the PEM text with `\n` between lines.

Sandbox (`true`) is for development builds. TestFlight and the App Store use the production APNs host: set `APNS_USE_SANDBOX=false` for those. The app sends the native APNs device token from `getDevicePushTokenAsync` to `POST /devices`. Push is off until the person enables it under Inställningar. A tap opens the screen in the `href` field (`blixtbo://hem`, `blixtbo://ansokningar`, `blixtbo://kopplingar`, or `blixtbo://notiser`).

## 6. App environment

```bash
cd apps/mobile
cp .env.example .env
```

Fill the `EXPO_PUBLIC_FIREBASE_*` values from the same Firebase web app as the site. `EXPO_PUBLIC_API_URL` is `https://blixtbo.se/api` unless you are talking to a local API. `EXPO_PUBLIC_ALLOW_INSECURE_API=1` is only for `http://127.0.0.1` on your machine. Never set it in a build that leaves the computer.

`EXPO_PUBLIC_APPLE_PRODUCT_ID` must match `APPLE_PRODUCT_ID`.

## 7. Build

Expo Go cannot run StoreKit or the push entitlement. Use a development build, then an App Store build.

From `apps/mobile`, with Xcode on a Mac:

```bash
npm install
npx expo prebuild --platform ios
open ios/*.xcworkspace
```

In Xcode: team, bundle id `se.blixtbo.app`, Sign in with Apple, Push Notifications. Archive → Distribute → App Store Connect → Upload. Do not click Submit for Review.

Or with EAS, still without submitting:

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform ios --profile production
```

EAS will ask for the distribution certificate and the APNs key if it manages credentials. Uploading the `.p8` to EAS does not replace the server env in section 5. The server sends the pushes.

`eas submit` uploads a build to App Store Connect. Do not run it until you mean to put a build in TestFlight, and do not submit that build for review from this task.

## 8. TestFlight

1. Wait until the build finishes processing in App Store Connect.
2. Answer the export-compliance question (standard encryption only) if it is asked again.
3. Internal testing: add Julia’s App Store Connect user.
4. Install from the TestFlight app. Sign in with Apple. Open Premium and confirm the disclosure, the price from StoreKit, Restore, and the three links (villkor, integritet, Apple EULA).
5. Buy in the sandbox Apple ID. Confirm Firestore `users/{uid}/billing/entitlement` shows `source=apple` and `status` `trialing` or `active`. Open blixtbo.se with the same account and confirm Premium is recognized after the site reads that document.
6. Turn on push, trigger a notice on the server, tap it, and confirm the right tab opens.
7. Add a landlord only with a fake password while `LANDLORD_MODE=dry-run`. Confirm the password is not left in the form.
8. Inställningar → Radera alla uppgifter om mig → type RADERA. Confirm the copy that the Apple subscription must be cancelled in iOS Settings.

## 9. What not to do yet

- Do not submit for App Review.
- Do not create the IAP from this repository.
- Do not point the reviewed build at `LANDLORD_MODE=live`.
- Do not add a Stripe checkout link to the iOS app.
- Do not ship landlord logos in the binary or in the screenshots.
