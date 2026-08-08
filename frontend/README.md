# Frontend — Guardia nel Cuore

Workspace **Angular 20** multi-progetto (Angular Material M3), mobile-first, tema
chiaro/scuro.

```
projects/client   app cittadini   → feed.guardianelcuore.it
projects/admin    backoffice      → admin.feed.guardianelcuore.it
projects/shared   libreria condivisa: modelli (Feedback, Category, …) e AuthService (Cognito/Amplify)
```

## Requisiti
- **Node 22 LTS** (`nvm use 22`) — Angular 20 non supporta Node 25.
- CLI via `npx ng` (v20 locale del workspace), non la eventuale `ng` globale.

## Sviluppo
```bash
nvm use 22
npm install
npx ng serve client --port 4200   # http://localhost:4200
npx ng serve admin  --port 4300   # http://localhost:4300
```
Non serve un backend locale: le chiamate passano dal **proxy del dev server** verso
l'API di produzione. Il CORS dell'API ammette **solo** i domini di produzione — nessuna
origine `localhost` — quindi il proxy non è una comodità ma il modo in cui funziona:

- `environment.development.ts` usa `apiUrl: '/api'` (percorso **relativo**, stessa
  origine della pagina → nessuna richiesta cross-origin);
- `proxy.conf.json` inoltra `/api/*` all'HTTP API;
- `fileReplacements` (configurazione `development` in `angular.json`) sostituisce
  `environment.ts`. Il build di produzione continua a usare l'URL assoluto.

⚠️ **Non mettere `apiUrl: ''`**: l'interceptor allega il JWT alle richieste che
iniziano con `apiUrl`, e con la stringa vuota **ogni** URL corrisponderebbe — il token
finirebbe anche su S3 e sul geocodificatore. C'è un test che lo impedisce.

⚠️ **L'upload delle foto non è provabile in locale**: il `PUT` va dal browser
direttamente a S3 con un URL assoluto prefirmato, quindi il proxy non lo copre.

## Test
```bash
CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  npx ng test client --watch=false --browsers=ChromeHeadless
CHROME_BIN=... npx ng test admin --watch=false --browsers=ChromeHeadless
```
**110 test** (77 client + 33 admin), in CI su push a `main` e su ogni PR.

📌 **Karma + Jasmine, non Vitest** (a differenza del backend): Karma gira in un
**Chrome vero**, quindi permette di verificare l'**impaginazione** — che in questo
progetto è la classe di difetti che arriva all'utente. In jsdom il layout non esiste
(`getBoundingClientRect` tutto a zero) e quei test sarebbero vuoti. Se un giorno Karma
va sostituito serve un runner **con browser reale**.

## Build & deploy
```bash
npx ng build client   # → dist/client/browser
npx ng build admin    # → dist/admin/browser
```
Deploy su S3 + CloudFront: vedi la sezione "Deploy" nel [README di root](../README.md).

## Note
- **Tema**: palette M3 calda generata in `projects/shared/styles/_theme-colors.scss`
  (seed `#C0392B` / `#E67E22`), font stack di sistema Apple, `color-scheme: light dark`.
- **Auth**: `AuthService` in `shared` (Amplify → Cognito); ogni app configura Amplify
  al bootstrap (`main.ts`) col proprio app client. Guard + interceptor JWT per-app.
- **Mappa**: Leaflet + OpenStreetMap (`projects/client/.../components/feedback-map`),
  con ricerca dell'indirizzo via Nominatim (`core/geocoding.service.ts`).
- **Icone**: Material Icons è servito **dal nostro dominio**
  (`shared/styles/_material-icons.scss`, font in `shared/assets/fonts/`), non dal CDN
  di Google: prima Google riceveva l'IP di ogni visitatore. ⚠️ La **versione sta nel
  nome del file** perché gli asset sono serviti `immutable`.
- **Partial condivisi** in `projects/shared/styles/`: `_theme-colors.scss`,
  `_form-field.scss` (l'area sotto i campi Material è alta 20px fissi e un hint su due
  righe sbordava sul campo successivo), `_material-icons.scss`.
- ⚠️ **`optimization.styles.inlineCritical` deve restare `false`** nei blocchi
  `production` di `angular.json`: la CSP delle distribuzioni non ammette script inline,
  e con l'inlining attivo Angular emette un `<link … onload>` che viene **bloccato** —
  il foglio di stile globale non si applica più. Un controllo nel workflow di deploy
  ferma la pubblicazione se ricompare.
