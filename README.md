# Guardia nel Cuore — feedback civico

Piattaforma web con cui i **cittadini di Guardia Piemontese** lasciano feedback,
proposte e segnalazioni sul paese. Promossa dall'associazione **Guardia nel
Cuore** (non è un canale ufficiale del Comune), che raccoglie e gestisce le
segnalazioni da un backoffice interno. Interamente **serverless su AWS**, costo
d'esercizio previsto **< 5 €/mese**.

**Online:**
- Cittadini → <https://feed.guardianelcuore.it>
- Backoffice (staff) → <https://admin.feed.guardianelcuore.it>

## Cosa fa

**App cittadini** (`feed.`)
- Bacheca pubblica delle proposte (lista + mappa), con filtri per categoria
- Dettaglio proposta: foto, mappa, stato, risposta pubblica dell'associazione
- **Voto** ("Sostieni") — 1 per utente
- **Nuova proposta**: titolo, categoria, descrizione, **foto** (upload sicuro),
  **posizione** (mappa + geolocalizzazione), visibilità pubblico/privato
- **I miei feedback**
- Registrazione/login (Cognito) con **approvazione dell'associazione**

**Backoffice** (`admin.`, solo staff)
- Sintesi con KPI + coda "richiede attenzione"
- Elenco feedback (filtro per stato)
- **Moderazione**: cambio stato (→ email al cittadino), nota interna, risposta pubblica
- Gestione **categorie**
- Gestione **cittadini**: approvazione iscrizioni + elenco attivi

## Architettura (sintesi)

```
Browser (Angular SPA)
   │  S3 + CloudFront (HTTPS)
   ▼
API Gateway HTTP  ──(JWT Cognito authorizer)
   ▼
Lambda (Node.js 20 / TypeScript)
   ├─ DynamoDB  (Feedbacks, Votes, Categories, FeedbackComments)
   ├─ S3        (foto, bucket privato, upload/lettura via URL prefirmati)
   ├─ Cognito   (User Pool, gruppi cittadino/membro/admin, trigger pre-auth)
   └─ SES       (email transazionali: cambio stato, approvazione iscrizione)
```

Dettagli completi in [`docs/02-architettura-aws.md`](docs/02-architettura-aws.md).

## Struttura del repository

```
/frontend   Workspace Angular 20 (Material M3)
            ├─ projects/client   app cittadini
            ├─ projects/admin    backoffice
            └─ projects/shared   modelli + AuthService condivisi
/backend    Handler Lambda (TypeScript) — vedi backend/README.md
/infra      AWS CDK (stack + construct) — vedi infra/README.md
/docs       Specifiche funzionali (01) e architetturali (02)
```

## Ambiente

- **Account AWS**: `324908170418` (personale, dedicato) · **regione `eu-west-1`**
- **Accesso**: AWS IAM Identity Center, profilo CLI `guardia-nel-cuore`
  (`aws sso login --profile guardia-nel-cuore`)
- **Node**: il **frontend** richiede **Node 22 LTS** (via `nvm use 22`); l'infra/CDK
  gira sul Node di sistema. La CLI Angular si invoca con `npx ng` (v20 locale).

## Sviluppo locale (frontend)

```bash
cd frontend
nvm use 22
npm install
npx ng serve client --port 4200   # → http://localhost:4200
npx ng serve admin  --port 4300   # → http://localhost:4300
```

Le due app puntano all'API di produzione (`environment.apiUrl`); non serve un
backend locale. Il CORS del bucket foto include `http://localhost:4200` per gli
upload in sviluppo.

## Deploy

**Infrastruttura (CDK):**
```bash
cd infra && npm install
ENVIRONMENT=prod npx cdk diff   GNCProd<Stack> --profile guardia-nel-cuore
ENVIRONMENT=prod npx cdk deploy GNCProd<Stack> --profile guardia-nel-cuore
```
Il codice dei backend è impacchettato automaticamente dalle Lambda CDK
(`NodejsFunction`) a partire da `/backend/src/handlers`.

**Frontend (automatico via CI):** un push su **`main`** che tocca `frontend/**`
attiva `.github/workflows/deploy-frontend.yml` → build + `s3 sync` + invalidazione
CloudFront (client e/o admin, in base ai path cambiati). Autenticazione via **OIDC**
(ruolo `gnc-github-deploy-frontend`, nessuna chiave nei secret; creato da `GNCProdCiStack`).
Si può lanciare anche a mano dal tab *Actions* (workflow_dispatch).

**Frontend (manuale, S3 + CloudFront):** se serve deployare fuori dalla CI —
```bash
cd frontend && nvm use 22
npx ng build client && npx ng build admin
aws s3 sync dist/client/browser s3://<client-bucket> --delete --profile guardia-nel-cuore
aws s3 sync dist/admin/browser  s3://<admin-bucket>  --delete --profile guardia-nel-cuore
aws cloudfront create-invalidation --distribution-id <client-dist> --paths "/*" --profile guardia-nel-cuore
aws cloudfront create-invalidation --distribution-id <admin-dist>  --paths "/*" --profile guardia-nel-cuore
```
(I nomi bucket / ID distribuzione sono negli output di `GNCProdFrontendStack`.)

## Autenticazione, ruoli e approvazione

- User Pool Cognito unico, gruppi **`admin`** / **`membro`** (staff backoffice) /
  **`cittadino`** (approvato).
- La registrazione cittadino è self-service (email + verifica), ma **il login è
  bloccato** finché lo staff non approva l'iscrizione (trigger **Pre-Authentication**
  su Cognito). Approvare = aggiungere l'utente al gruppo `cittadino`; all'approvazione
  parte un'email di benvenuto (SES).
- **Contenuti privati**: l'app cittadini è interamente dietro login — chi non è
  autenticato viene mandato alla pagina di accesso e nessun contenuto è leggibile
  (nemmeno via API). Le proposte nascono **private**: solo lo staff può pubblicarle.
- **Gestione staff**: aggiungere/rimuovere admin/membro si fa via CLI/console Cognito
  (`admin-add-user-to-group`), non c'è ancora una UI dedicata.

## Monitoraggio e avvisi

- **Costi**: budget mensile (**15 USD**) con avvisi email a 50/80/100% + previsione.
- **Operativi**: allarmi CloudWatch → email su errori Lambda e 5xx dell'API.
- Email e soglia in `infra/lib/config/environments/prod.ts` (`alerts`). Dettagli:
  `docs/02-architettura-aws.md` §11bis.

## Stato e note operative

- ✅ **In produzione** su feed./admin.feed.guardianelcuore.it.
- ✅ **CI/CD** frontend attivo (GitHub Actions + OIDC, deploy su push a `main`).
- ⏳ **SES**: in *sandbox* → le email transazionali arrivano solo a destinatari
  verificati finché AWS non concede la *production access* (richiesta inviata).
  La verifica email di registrazione (mittente Cognito) funziona già per tutti.
- 🔜 i18n IT/EN, rimozione di `localhost` dal CORS a regime, UI gestione staff.

## Documentazione

- [`docs/01-specifiche-funzionali.md`](docs/01-specifiche-funzionali.md) — cosa fa e per chi
- [`docs/02-architettura-aws.md`](docs/02-architettura-aws.md) — architettura, dati, API
- [`backend/README.md`](backend/README.md) — handler ed endpoint
- [`infra/README.md`](infra/README.md) — stack CDK e comandi
