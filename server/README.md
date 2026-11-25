# Blixtbo server

API plus one Playwright worker. No paid model. Landlord passwords are encrypted with a per-user key. Only the worker has the key that unwraps them. The API and the admin screens never receive it.

App data lives in Firestore (`DATA_BACKEND=firestore`). Postgres remains the worker job queue. The worker writes ciphertext to `credentials/{firebaseUid}/landlords/{sourceId}` with the Admin SDK. Set `FIREBASE_AUTH_EMULATOR_HOST` and `FIRESTORE_EMULATOR_HOST` when you point that SDK at the emulators. `LANDLORD_MODE` stays `dry-run` until a real landlord page has been checked.

End users sign in with Firebase Auth in the browser. `POST /auth/firebase` with `Authorization: Bearer <ID token>` links that user to the API. `/internal/ops` still requires that token, `OWNER_GOOGLE_EMAIL`, and the TOTP cookie. The old Google OAuth redirect is unused for new sign-ins.

Nothing in this folder buys or starts a server. The steps below are what you run yourself.

## What runs where

- `api` answers the app and the hidden admin path. `WORKER_KEK` is blank here, so this process cannot decrypt a landlord login.
- `worker` creates landlord accounts, applies, and renews queues. It is the only process with `WORKER_KEK`.
- `db` is Postgres with a small memory setting, on the same machine.

Applying and renewing are Playwright scripts. A small open embedding model is used only to compare a profile with the wording of an ad. Income and documents are checked with ordinary rules.

Set `LANDLORD_MODE=dry-run` until the selectors for each landlord page have been checked. Dry-run does not open those sites.

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
11. Keep `LANDLORD_MODE=dry-run` until you have watched one real login in a staging browser and updated the selectors in `blixtbo/landlords.py`. Then set `LANDLORD_MODE=live` and recreate the worker: `docker compose up -d worker`.

Backups are `pg_dump` of the database volume. Losing `WORKER_KEK` makes every stored landlord login unreadable. Keep a copy of that value outside the server, not in git.

## Login handling

A user approves once in the app, with Google or an email code. The worker then creates the landlord account, generates the password, and stores it as ciphertext under that user's data key. Later apply and renew jobs decrypt it only inside the worker, log in, and do the task.

If the site says the password is wrong, or the session is dead and a fresh login fails, the connection is marked `needs_user` and the user gets a notice. The worker does not guess a new password.

Each landlord has a `requires_bankid` flag. Wåhlin and Stena Fastigheter are examples that require it. The worker does not script that login. It pauses the job (`waiting_bankid`) and notifies the user to open BankID on their own device, at the landlord, not at Blixtbo. When the landlord session comes back, the worker stores only that session cookie, encrypted with the user's data key, and deletes the plaintext from the job. Personal numbers, autostart tokens, signatures, and any other BankID field are refused and never written. A later renewal pauses again and sends a new notice, because the landlord may ask for BankID once more.

Admin list endpoints return email, name, and connection status. They do not select the ciphertext or the wrapped key.
