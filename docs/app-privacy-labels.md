# App Privacy labels and nutrition

Fill these in App Store Connect → App Privacy for the iOS app. They match `apps/mobile/PrivacyInfo.xcprivacy` and the `privacyManifests` block in `apps/mobile/app.config.ts`. Tracking is off. There is no advertising SDK and no App Tracking Transparency prompt.

This binary does not upload ID documents, payslips, or income. Those fields exist on the website. Do not mark Photos, Precise Location, Contacts, Health, or Browsing History for this version.

All rows below are **linked to the user** and **used for app functionality**. None are used for tracking, advertising, or third-party advertising.

| Data | Where it goes | Stored on the phone |
|---|---|---|
| Name | Firebase Authentication, and the API user row | Firebase Auth persistence (not a landlord secret) |
| Email address | Same. Apple Hide My Email still provides a relay address | Same |
| User ID | Firebase uid. Sent as the bearer token. Mapped to the App Store `appAccountToken` | Same |
| Device ID | APNs device token, only if the person turns push on | AsyncStorage key `blixtbo-push-token` after they opt in. Not required to use the app |
| Purchase history | StoreKit transaction JWS, verified on the server. Firestore `users/{uid}/billing/entitlement` with `source=apple` | Not stored as a receipt file by the app |
| Product interaction | Listing reads, queued applications, notices opened | Not a separate analytics SDK |
| Other user content | Landlord username, and the password in the HTTPS body of `POST /connections/{id}/credentials` | Password is cleared from the form after send. It is not written to disk or the Keychain |

The password is encrypted on the server (AES-GCM under a key the API process does not have). The app never asks for BankID.

Customer support is a `mailto:` link to support@blixtbo.se. The message is not stored by the app.

Firebase, Expo, and StoreKit ship their own privacy manifests. `npx expo prebuild` merges those with the manifest in this repo. After the first iOS build, open the generated `PrivacyInfo.xcprivacy` in Xcode and confirm the merged file still says tracking is false.

## Export compliance

The app uses HTTPS (TLS) only. `ITSAppUsesNonExemptEncryption` is `false` in `app.config.ts` → `ios.infoPlist`. In App Store Connect, answer that the app uses encryption and that it qualifies for the standard exemption (HTTPS). No proprietary or non-standard cryptography is in the iOS binary. Landlord encryption runs on the server, not in the app.

Apple may still expect the annual US self-classification report for exempt encryption. Confirm that when the build is uploaded. Do not upload the APNs `.p8` key or `WORKER_KEK` with the binary.

## Age rating notes

Do not select Made for Kids.

Suggested answers on the questionnaire:

- No violence, sexual content, profanity, horror, alcohol, tobacco, drugs, gambling, contests, or unrestricted web browser.
- The app can open Safari to the terms, the privacy policy, a support email, and a listing URL returned by the API. That is not an in-app browser.
- The subject is adult tenancy: accounts, applications, and an optional subscription. This version does not include a public review feed or a public chat.

Set the rating to **16+** if App Store Connect lets you choose that after the questionnaire. If the form only calculates a rating, keep the answers above and do not mark the app as a children’s app. The audit’s reason for 16+ is the adult housing context, not graphic content.
