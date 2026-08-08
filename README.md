# Guardia nel Cuore — feedback civico

Piattaforma web con cui **chi ha Guardia Piemontese nel cuore** lascia feedback,
proposte e segnalazioni sul paese — non solo i residenti: il rapporto col paese
(residente, non residente, sostenitore, turista) si dichiara all'iscrizione.
Promossa dall'associazione **Guardia nel Cuore** (non è un canale ufficiale del
Comune), che raccoglie e gestisce le segnalazioni da un backoffice interno.
Interamente **serverless su AWS**, costo d'esercizio previsto **< 5 €/mese**.

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
- **I miei feedback**: modifica e eliminazione della propria proposta (la modifica
  solo finché è privata: chi ha votato l'ha fatto per quel testo)
- **Segnalazione** di un contenuto allo staff (motivo scelto, autore non rivelato)
- Registrazione/login (Cognito) con **attivazione immediata** alla verifica dell'email, e
  **recupero password** self-service

**Backoffice** (`admin.`, solo staff)
- Sintesi con KPI + coda "richiede attenzione"
- Elenco feedback (filtro per stato)
- **Moderazione**: cambio stato, pubblicazione in bacheca, risposta pubblica,
  nota interna e **correzione del testo** (l'autore viene avvisato). Ogni
  cambiamento visibile al cittadino gli manda una email
- Feedback **segnalati**: badge, filtro e motivi delle segnalazioni
- Gestione **categorie**
- Gestione **cittadini**: elenco attivi + chi non è attivo (riattivazione)

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
   ├─ Cognito   (User Pool, gruppi cittadino/membro/admin,
   │             trigger pre-auth = gate accesso, post-confirmation = attiva + avvisa)
   └─ SES       (tutte le email: verifica registrazione e recupero password di
                 Cognito, benvenuto, stato/risposta/pubblicazione, avvisi
                 allo staff per iscrizioni, segnalazioni ed eliminazioni)
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
backend locale. Il CORS dell'API include **entrambe** le porte (`4200` e `4300`),
quello del bucket foto solo la `4200` (l'admin non carica foto). Le porte non
sono arbitrarie: usarne altre fa fallire le chiamate con un errore CORS.

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

## Autenticazione, ruoli e accesso

- User Pool Cognito unico, gruppi **`admin`** / **`membro`** (staff backoffice) /
  **`cittadino`** (abilitato ad accedere).
- La registrazione è self-service e l'**attivazione è automatica**: il trigger
  **Post-Confirmation** aggiunge il nuovo iscritto al gruppo `cittadino` appena
  verifica l'email, e gli manda il benvenuto (SES). Lo staff riceve comunque
  l'avviso della nuova iscrizione, senza dover fare nulla.
  *L'approvazione manuale è stata rimossa l'8 agosto 2026: era un collo di
  bottiglia su due o tre persone.*
- Il trigger **Pre-Authentication** resta come **interruttore**, non come attesa:
  chi non è in un gruppo attivo non accede. Per togliere l'accesso a qualcuno lo si
  rimuove dal gruppo `cittadino` (console Cognito o «rifiuta» dal backoffice).
  ⚠️ **Non cancellarlo dalla console**: la cancellazione da Cognito non esegue la
  pulizia dell'app, e proposte, foto, voti e segnalazioni resterebbero legati a un
  autore inesistente. Per rimuovere del tutto una persona si usa «rifiuta» dal
  backoffice o «elimina account» dall'app.
- ⚠️ Se l'attivazione automatica fallisse, il cittadino resterebbe fuori senza che
  nessuno lo sappia: per questo l'esito viaggia nelle email — lo staff riceve
  «Iscrizione NON attivata — serve un intervento» e la persona compare in
  **Cittadini → Non attivi**, dove «Approva» la riabilita.
- **Contenuti privati**: l'app cittadini è interamente dietro login — chi non è
  autenticato viene mandato alla pagina di accesso e nessun contenuto è leggibile
  (nemmeno via API). Le proposte nascono **private**: solo lo staff può pubblicarle.
- **Gestione staff**: aggiungere/rimuovere admin/membro si fa via CLI/console Cognito
  (`admin-add-user-to-group`), non c'è ancora una UI dedicata.
- **Azioni distruttive**: passano da un dialog che dichiara l'effetto; per
  l'eliminazione dell'account serve digitare `ELIMINA`. Nessuna finestra nativa
  del browser in tutta l'app.

## Monitoraggio e avvisi

- **Costi**: budget mensile (**15 USD**) con avvisi email a 50/80/100% + previsione.
- **Operativi**: allarmi CloudWatch → email su errori Lambda e 5xx dell'API.
- **Reputazione email**: allarmi sul tasso di rimbalzo (>5%) e di lamentele
  (>0,1%) di SES, le soglie oltre le quali AWS può sospendere l'invio. Servono
  perché le notifiche di rimbalzo di SES sono inoltrate all'indirizzo del
  mittente (`noreply@`), che non è una casella: senza allarmi si perderebbero.
- Email e soglia in `infra/lib/config/environments/prod.ts` (`alerts`). Dettagli:
  `docs/02-architettura-aws.md` §11bis.

## Stato e note operative

- ✅ **In produzione** su feed./admin.feed.guardianelcuore.it, **in test con i
  membri dell'associazione**: l'app è raggiungibile ma non ancora annunciata ai
  cittadini.
- ✅ **CI/CD** frontend attivo (GitHub Actions + OIDC, deploy su push a `main`).
- ✅ **SES in produzione** (production access concessa il 2026-07-29: 50.000
  email/giorno, 14/s). Tutte le email partono dal dominio del progetto con DKIM,
  SPF e DMARC allineati — comprese quelle di Cognito (verifica registrazione e
  recupero password), che prima usavano il mittente AWS condiviso. **DMARC in
  `quarantine`** dal 2026-08-05.
- ⚠️ **Un solo ambiente: `prod`.** Non esiste un dev/staging separato: `ng serve`
  contro l'API di produzione è l'unico modo di provare una modifica prima di
  esporla. Ne derivano le origini `localhost` nel CORS (vedi sotto).
- ✅ **Test**: 150 backend (Vitest, ogni handler coperto) + 102 frontend (Karma su
  Chrome vero, così si verifica anche l'impaginazione). Entrambe le suite in CI su
  push a `main` e su ogni PR.
- ✅ **Informativa privacy** completa con i dati del titolare (Associazione
  «Guardia nel Cuore», C.F. 96055780785) e **`Reply-To`** verso il recapito
  dell'associazione su tutte le email, Cognito compreso: il mittente resta
  `noreply@`, ma una risposta ora arriva a qualcuno.
- 🔜 test e2e, i18n IT/EN, UI gestione staff, portabilità dei dati ("scarica i
  miei dati"), età minima di iscrizione (oggi non dichiarata).

- ✅ **Material Icons servito dal nostro dominio** (`shared/styles/_material-icons.scss`,
  font in `shared/assets/fonts/`): prima arrivava da `fonts.gstatic.com`, quindi
  Google riceveva l'IP di ogni visitatore mentre l'informativa dichiarava solo
  OpenStreetMap e AWS fra i destinatari. Rimosso il terzo invece di dichiararlo;
  la CSP non ha più host di Google. ⚠️ La **versione sta nel nome del file**
  (`-v145`) perché gli asset sono serviti `immutable`: con un nome fisso un font
  sostituito resterebbe nei browser fino a un anno. Un controllo nel workflow di
  deploy ferma la pubblicazione se un riferimento a Google ricompare.
- ✅ **Tipo delle foto imposto in lettura** (`lib/foto-url.ts`): il tipo dichiarato
  al caricamento non è un vincolo (il presigner non firma `content-type`), quindi
  i GET prefirmati impongono `response-content-type` ricavato dall'estensione
  della chiave — parametro **firmato**, manometterlo dà 403. Estensione inattesa
  → `application/octet-stream` + `attachment`.
- ✅ **Origini `localhost` rimosse dal CORS** di API e bucket foto (vedi
  § Sviluppo locale) e **TTL del record NS** `feed` alzato a 172800.
- ✅ **Header di sicurezza** su entrambe le distribuzioni CloudFront (HSTS,
  CSP con host esatti, `nosniff`, `Referrer-Policy`, `X-Frame-Options`), **tetto
  di 5 MB firmato** sull'upload delle foto (prima era solo lato client) e **log
  CloudWatch a 90 giorni** (prima non scadevano mai, e contengono indirizzi email).
  ⚠️ La CSP non ammette script inline: `optimization.styles.inlineCritical` deve
  restare **false** in `angular.json`, altrimenti Angular emette un `onload` che
  viene bloccato e il foglio di stile globale non si applica. Un controllo nel
  workflow di deploy ferma la pubblicazione se ricompare.

## Sviluppo locale

Il CORS dell'API e del bucket foto ammette **solo** i domini di produzione: non
c'è nessuna origine `localhost`. Lo sviluppo locale funziona comunque perché il
dev server Angular fa da **proxy**:

- `environment.development.ts` (uno per app) usa `apiUrl: '/api'` — percorso
  **relativo**, quindi stessa origine della pagina e nessuna richiesta
  cross-origin;
- `proxy.conf.json` inoltra `/api/*` all'HTTP API di produzione;
- `fileReplacements` (configurazione `development` in `angular.json`) sostituisce
  `environment.ts` con la variante di sviluppo. Il build di produzione continua a
  usare l'URL assoluto.

⚠️ **Non mettere `apiUrl: ''`**: l'interceptor allega il JWT alle richieste che
iniziano con `apiUrl`, e con la stringa vuota **ogni** URL corrisponderebbe — il
token finirebbe anche su S3 e sul geocodificatore di OpenStreetMap. C'è un test
che lo impedisce (`core/auth.interceptor.spec.ts`).

⚠️ **L'upload delle foto NON è provabile in locale**: il PUT va dal browser
direttamente a S3 con un URL assoluto prefirmato, quindi il proxy non lo copre e
il bucket non ammette `localhost`. Per provarlo si riaggiunge
`http://localhost:4200` in `infra/lib/app.ts` e si ridistribuisce lo
StorageStack, ricordandosi di rimuoverlo.

## Lancio pubblico (checklist)

Da fare **prima di annunciare l'app ai cittadini**, non prima: durante il test
con i membri queste voci sono scelte consapevoli, non dimenticanze.

- [ ] **Report DMARC (`rua=`)** verso una casella che li riceva, poi valutare
      `p=reject`. Oggi la policy è `quarantine` senza report: senza visibilità
      non si passa a `reject`, perché si scarterebbe posta legittima senza
      accorgersene. Serve prima una destinazione sul dominio (SES inbound) o un
      servizio esterno.

## Documentazione

- [`docs/01-specifiche-funzionali.md`](docs/01-specifiche-funzionali.md) — cosa fa e per chi
- [`docs/02-architettura-aws.md`](docs/02-architettura-aws.md) — architettura, dati, API
- [`backend/README.md`](backend/README.md) — handler ed endpoint
- [`infra/README.md`](infra/README.md) — stack CDK e comandi
