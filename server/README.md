# Blixtbo server

API plus one Playwright worker. No paid model. Landlord passwords are encrypted with a per-user key. Only the worker has the key that unwraps them. The API and the admin screens never receive it.

App data lives in Firestore (`DATA_BACKEND=firestore`). Postgres remains the worker job queue. The worker writes ciphertext to `credentials/{firebaseUid}/landlords/{sourceId}` with the Admin SDK. Set `FIREBASE_AUTH_EMULATOR_HOST` and `FIRESTORE_EMULATOR_HOST` when you point that SDK at the emulators. `LANDLORD_MODE` stays `dry-run` until you mean to call the landlord sites. The worker reads it from the environment (`${LANDLORD_MODE:-dry-run}`). It is not hard-coded in compose.

End users sign in with Firebase Auth in the browser. `POST /auth/firebase` with `Authorization: Bearer <ID token>` links that user to the API. `/internal/ops` still requires that token, `OWNER_GOOGLE_EMAIL`, and the TOTP cookie. The old Google OAuth redirect is unused for new sign-ins.

Nothing in this folder buys or starts a server. The steps below are what you run yourself.

## What runs where

- `api` answers the app and the hidden admin path. `WORKER_KEK` is blank here, so this process cannot decrypt a landlord login.
- `worker` creates landlord accounts, applies, and renews queues. It is the only process with `WORKER_KEK`.
- `db` is Postgres with a small memory setting, on the same machine.

Applying and renewing are Playwright scripts. A small open embedding model is used only to compare a profile with the wording of an ad. Income and documents are checked with ordinary rules.

Set `LANDLORD_MODE=dry-run` until you want live calls. Dry-run does not open landlord sites. Live calls each site's own JSON API or HTML form. A browser fallback exists only when `LANDLORD_BROWSER=1`.

## Deploy

1. Create a CX22-class VPS (2 vCPU, 4 GB RAM, about 40 GB disk) in a region close to Sweden. Ubuntu 24.04 is enough. Add your SSH key. Do not open any port except 22, 80 and 443.
2. Point a hostname at the server if you want Google sign-in. Google requires a public redirect URL.
3. SSH in and install Docker from Docker's own apt repository.
4. Copy this `server` directory to the machine, for example `/opt/blixtbo`.
5. Create the secrets on the server:

```bash
cd /opt/blixtbo
cp .env.example .env
python3 -c "import secrets; print(secrets.token_hex(32))"
python3 -c "import os,base64; print(base64.b64encode(os.urandom(32)).decode())"
```

Put the first value in `APP_SECRET` and the second in `WORKER_KEK`. Set `POSTGRES_PASSWORD` to a long random string and use the same password inside `DATABASE_URL`.

6. In Google Cloud Console, create an OAuth client of type Web application. Add the redirect URI you set in `GOOGLE_REDIRECT_URI`. Turn on 2-step verification on the Google account named in `OWNER_GOOGLE_EMAIL`. That account is the only one that can open the admin path.
7. Create a free Hugging Face account and a read token. Put it in `HF_TOKEN`. Leave `HF_MODEL` as `intfloat/multilingual-e5-small`. Do not buy inference.
8. Start the stack:

```bash
docker compose up -d --build
docker compose ps
curl -fsS http://127.0.0.1:8080/health
```

9. Put Caddy or another reverse proxy on port 443 and forward to `127.0.0.1:8080`. Do not publish Postgres.
10. Sign in with Google on the site. Open `https://your-domain.example/internal/ops` (or whatever you set as `ADMIN_PATH`). The first visit shows an otpauth URI. Add it to an authenticator app, then POST the 6-digit code to `/internal/ops/totp`. After that, the admin pages stay behind that code for eight hours.
11. Keep `LANDLORD_MODE=dry-run` until the adapters have been checked against fixtures. Then set `LANDLORD_MODE=live` in `.env` and recreate the worker: `docker compose up -d worker`. A server override file can pin the same variable; this compose file does not.

Backups are `pg_dump` of the database volume. Losing `WORKER_KEK` makes every stored landlord login unreadable. Keep a copy of that value outside the server, not in git.

## Login handling

A password the user types is sealed in the API with `WORKER_SEAL_PUBLIC` before it is written on the job. The API has no `WORKER_KEK` and no `WORKER_SEAL_PRIVATE`, so it cannot open the seal or unwrap a data key. The worker opens the seal, encrypts the password under the user's data key, and replaces the job payload with `{}`. Plaintext is not stored. BankID fields are refused.

HomeQ is the landlord where Blixtbo can create an account: e-post, lösenord and the in-app terms approval. The job then pauses until HomeQ says the e-mail is confirmed and the user has verified with BankID at HomeQ. Those notices are "Bekräfta e-posten från HomeQ" and "Verifiera dig med BankID hos HomeQ". Apply uses `POST /api/v4/applications` with the listing's object id. Each HomeQ error code becomes a Swedish notice. There is no queue to renew; renew re-checks the token.

Bostadsförmedlingen is BankID only. The user logs in on their site and Blixtbo stores the session cookie. An interest is binding for the seeker with the longest queue time after the ad ends, so nothing is sent until the app stores that confirmation on the job. `ArInloggad=false` means the session expired and the job waits for BankID again. Renew checks the session and tells the user if the queue needs a renewal. Svenska Bostäder, Familjebostäder and Stockholmshem are in that same queue. They have no separate login.

Wåhlin, Heimstaden, Victoriahem (formerly Hembla) and Rikshem take an existing site password on the Mina sidor form. Blixtbo does not create those accounts. A session cookie is the alternative. BankID buttons on those pages are never called. Rikshem homes in Stockholm, Uppsala and Malmö stay on the municipal queues.

Stena Fastigheter takes e-post and password (`user_type: Tenant`) on the public credentials call. A one-time code pauses the job. The BankID routes in that app are not called.

Uppsala Bostadsförmedling takes a password at `/mypages/api/account/login` and applies with the `createApplication` mutation. Registration stays with the user. The BankID endpoint is not called.

SSSB is a WordPress password login for student housing. A captcha or a missing student certificate pauses the job and says the user is not eligible when the site says so.

Qasa means a message to a private landlord. The app drafts it from the profile and the listing. The user edits it, copies it, and opens the listing. Nothing is posted to Qasa.

These are not automated, on purpose:

- Blocket Bostad. robots.txt forbids automated use without written permission.
- Samtrygg. robots.txt disallows `/api`, `/Messages`, `/Chat` and `/Profile`. Applying is booking a viewing and chatting.
- Akelius. The public rent site does not list Swedish cities. My Pages is a tenant portal.
- Wallenstam and other HomeQ landlords, including Bostaden-linked ones. Their ads and applications go through the HomeQ adapter. The company name is on the listing.
- Boplats Göteborg and Boplats Syd. Not in this change.

A captcha, a 403 or a 429 pauses the job (`waiting_user`) and does not retry. A missing field pauses as "sidan har ändrats". Wrong password and a dead session pause as `needs_user`.

Admin list endpoints return email, name, and connection status. They do not select the ciphertext or the wrapped key.
