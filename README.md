# Blixtbo

Svensk prototyp för att hinna först till förstahandskontrakt, och för att hålla koll på ansökningar och bostadsköer. Allt körs i webbläsaren med exempeldata. Det finns ingen server, ingen riktig inloggning och inget som skickas iväg.

## Köra lokalt

```bash
npm install
npm run dev
```

Appen ligger på [http://127.0.0.1:43123](http://127.0.0.1:43123).

## Statisk export

```bash
npm run build
npx serve out
```

`next build` skriver en statisk sajt till mappen `out`. Den kan läggas på vilken webbserver som helst.

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

Varumärket är en platshållare och byts genom att söka på `Blixtbo`.
