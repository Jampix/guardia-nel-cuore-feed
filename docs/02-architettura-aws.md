# Specifiche Architetturali — Guardia nel Cuore

> Stato: **v1.0 — IN PRODUZIONE** · Riferimento funzionale: `01-specifiche-funzionali.md`
>
> **Live:** cittadini <https://feed.guardianelcuore.it> · backoffice <https://admin.feed.guardianelcuore.it>
>
> Tutti gli stack sono deployati su account `324908170418` (`eu-west-1`, cert in
> `us-east-1`): Data, Auth, Storage, Api, Dns, Cert, Frontend, CostOptimization.
> `RemovalPolicy: RETAIN` su Data/Auth/Storage. Frontend Angular pubblicati su
> S3+CloudFront.
>
> **Output principali:**
> - Cognito User Pool `eu-west-1_8tDpBt93Z` · app client cittadini `1g6b1d8p5s6m82vrp1id53gkm2` · admin `3ba3hvlq6rtl7dlj476veee8mu`
> - API `https://dex1zyd5pe.execute-api.eu-west-1.amazonaws.com`
> - Bucket foto / bucket+distribuzioni frontend: vedi output `GNCProdStorageStack` / `GNCProdFrontendStack`.

## 0. Parametri account/deploy
- **Account AWS**: `324908170418` (account personale dedicato al progetto).
- **Accesso**: AWS IAM Identity Center — `https://d-9367980450.awsapps.com/start`.
- **Regione**: **`eu-west-1` (Irlanda)**.
- **Dominio**: `guardianelcuore.it`, registrato nell'**account main** dell'Identity Center.
- **Sottodomini**: client → `feed.guardianelcuore.it`, admin → `admin.feed.guardianelcuore.it`.
- **DNS cross-account**: hosted zone `feed.guardianelcuore.it` nell'**account di progetto** (`324908170418`); **delega NS** dalla zona `guardianelcuore.it` (account main). Un solo certificato ACM (us-east-1) copre entrambi i sottodomini.
- **Ambiente**: solo **`prod`** (dev/staging riaggiungibili in futuro).

## 1. Principi guida
- **Serverless & scala-a-zero**: paghi (quasi) solo quando qualcuno usa l'app.
- **Un solo linguaggio**: TypeScript ovunque (Angular, Lambda Node.js, CDK).
- **Semplicità di gestione**: poche persone, poca manutenzione, infrastruttura come codice.
- **Sicurezza di default**: autenticazione gestita, permessi minimi (least privilege).

## 2. Stack tecnologico

| Livello | Tecnologia | Perché |
|---|---|---|
| Frontend | **Angular** (standalone components) | Scelta dell'utente; SPA responsive, mobile-first |
| i18n | **@ngx-translate** | Cambio lingua IT/EN a runtime, semplice |
| Mappa | **Leaflet + OpenStreetMap** | Gratis (no costi Amazon Location) per mostrare/scegliere il luogo |
| Hosting FE | **S3 + CloudFront** | Statico, economico, CDN globale, HTTPS |
| Auth | **Amazon Cognito** (User Pool) | Registrazione/OTP/reset password già pronti |
| API | **API Gateway (HTTP API) + Lambda** | HTTP API costa meno della REST API; Lambda scala a zero |
| Runtime Lambda | **Node.js 20 (TypeScript)** | Stesso linguaggio del FE |
| Database | **DynamoDB** (multi-table, on-demand) | NoSQL serverless, costo per richiesta, tabelle leggibili |
| Foto | **S3** (bucket dedicato) + **URL prefirmati** | Upload diretto dal browser, niente traffico via Lambda |
| Email | **Amazon SES** | Invio email al cambio stato |
| IaC | **AWS CDK (TypeScript)** | Tutta l'infra versionata nel repo |
| CI/CD | **GitHub Actions** (v2) | Deploy automatico su push (v1 anche deploy manuale) |

## 3. Diagramma logico

```
                    ┌─────────────────────────────┐
   Cittadino /      │        CloudFront (HTTPS)    │
   Membro (browser) │  ┌──────────────┐            │
   Angular SPA ─────┼─▶│  S3 (statico)│  frontend  │
                    │  └──────────────┘            │
                    └───────────┬─────────────────┘
                                │ chiamate API (JWT Cognito)
                                ▼
                    ┌─────────────────────────────┐
                    │   API Gateway (HTTP API)     │
                    │   + Cognito JWT Authorizer   │
                    └───────────┬─────────────────┘
                                ▼
                    ┌─────────────────────────────┐
                    │   Lambda (Node.js/TS)        │
                    │   - feedback CRUD            │
                    │   - voti / bacheca pubblica  │
                    │   - categorie               │
                    │   - backoffice / admin      │
                    │   - presigned URL foto      │
                    └───┬───────────┬─────────┬───┘
                        ▼           ▼         ▼
                ┌───────────┐ ┌──────────┐ ┌──────────┐
                │ DynamoDB  │ │ S3 foto  │ │   SES    │
                │(dati app) │ │(immagini)│ │ (email)  │
                └───────────┘ └──────────┘ └──────────┘

        Cognito User Pool ─── gruppi: cittadino | membro | admin
```

## 4. Autenticazione, ruoli e accesso (Cognito)
- **User Pool** unico con verifica email (codice), reset password. Frontend via **@aws-amplify/auth**.
- **Gruppi**: `admin` / `membro` (staff backoffice) / `cittadino` (abilitato ad accedere).
- Il ruolo viaggia nel **JWT** → l'API Gateway usa un **Cognito Authorizer**; per le
  operazioni di backoffice ogni Lambda ricontrolla il gruppo (claim `cognito:groups`),
  perché l'authorizer valida solo la validità del token, non il ruolo.
- **Attivazione automatica** (dal 2026-08-08, prima era un'approvazione manuale): il
  trigger **Post-Confirmation** aggiunge il nuovo iscritto al gruppo `cittadino` appena
  verifica l'email e gli manda il benvenuto (SES). Lo staff riceve l'avviso della nuova
  iscrizione ma non deve fare nulla. *L'approvazione manuale era un collo di bottiglia
  su due o tre persone.*
- Il trigger **Pre-Authentication** resta come **interruttore**: chi non è in un gruppo
  attivo non accede. Serve a **togliere** l'accesso, non a farlo attendere.
- ⚠️ **Rimuovere dal gruppo non basta.** Il pre-auth scatta **solo al login con
  password**, non sul rinnovo del token: ID/access durano 60 minuti ma il **refresh 30
  giorni**, e Amplify lo rinnova in silenzio. Perciò `POST /admin/users/{u}/revoke`
  chiama anche **`AdminUserGlobalSignOut`**, che invalida subito i token di rinnovo.
  Resta solo la coda del token già in mano (≤ 1 ora): azzerarla richiederebbe un
  controllo dei gruppi a **ogni** chiamata dell'API, che oggi non c'è — l'authorizer
  verifica solo la validità del token.
- Due app client (SPA, senza secret): uno per il frontend cittadini, uno per il backoffice.

## 5. Modello dati DynamoDB (multi-table)

Scelta: **poche tabelle separate e leggibili** (billing on-demand). Prefisso nomi con l'ambiente, es. `gnc-prod-*`.

### Tabella `Feedbacks`
- **Chiave primaria**: `id` (partition key).
- Attributi: `titolo`, `descrizione`, `categoriaId`, `stato`, `visibilita`
  (`pubblico`|`privato`), `fotoKey` (chiave S3 della foto; l'URL di lettura è
  prefirmato al volo), `lat`, `lng`, `luogo`, `numeroVoti`, `autoreId`,
  `autoreNick`, `lingua`, `rispostaPubblica`, `notaInterna` (solo staff — mai
  esposta ai cittadini), `createdAt`, `updatedAt`.
- **Stati**: `proposta` → `in_valutazione` → `in_lavorazione` → `risolto` (+ `archiviato`).
- **GSI `byAutore`** ("i miei feedback"): PK `autoreId`, SK `createdAt`.
- **GSI `byVisibilita`** (bacheca pubblica): PK `visibilita`, SK `createdAt`.

### Tabella `Votes`
- **Chiave composta**: PK `feedbackId`, SK `userId` → garantisce **1 voto per utente per feedback** (write condizionata).
- Attributo: `createdAt`.
- Il conteggio è denormalizzato su `Feedbacks.numeroVoti` (aggiornato con `UpdateItem ADD` in modo atomico), così la bacheca non conta i voti a ogni lettura.

### Tabella `Categories`
- **Chiave primaria**: `id`.
- Attributi: `nome`, `attiva` (bool), `creatoDa`, `createdAt`.

### Tabella `FeedbackComments`
- PK `feedbackId`, SK `sk`. **In uso per le segnalazioni**: `sk = REPORT#<userId>`,
  `tipo = REPORT`, più motivo e data. La chiave composta rende la segnalazione
  **idempotente** (un utente non può segnalare due volte lo stesso contenuto) e
  permette di leggere i motivi senza rivelare chi ha segnalato.
- Nota interna e risposta pubblica restano **denormalizzate** su `Feedbacks`
  (`notaInterna` / `rispostaPubblica`): per la moderazione attuale basta l'ultima, e
  una cronologia completa non serve a nessuno oggi.

## 6. Endpoint API

Rotte effettive dell'HTTP API. Mappa endpoint → handler in
[`../backend/README.md`](../backend/README.md). **Contenuti privati**: non ci sono
endpoint pubblici — anche bacheca e categorie richiedono il token.

**Cittadino** (JWT):
- `GET /categories` — categorie attive
- `GET /feedback/public` — bacheca (solo proposte `pubblico`), paginata
- `POST /feedback` — crea proposta (nasce **sempre privata**)
- `GET /feedback/mine` — le mie proposte (anche private)
- `PATCH·DELETE /feedback/{id}` — modifica (**solo finché privata** → `409` dopo la pubblicazione) / elimina
- `GET·POST·DELETE /feedback/{id}/vote` — stato voto / vota / ritira
- `POST /feedback/{id}/report` — segnala un contenuto (1 per utente, idempotente)
- `POST /uploads/presign` — URL prefirmato per la foto (tipo **e dimensione** firmati)
- `DELETE /account` — diritto all'oblio: dati + account

**Backoffice** (JWT + gruppo `admin`/`membro`):
- `GET /admin/feedback` — tutti i feedback (anche privati)
- `PATCH /admin/feedback/{id}` — moderazione: `stato` / `visibilita` / `rispostaPubblica` / `notaInterna` / correzione di `titolo` e `descrizione` (l'autore viene avvisato)
- `GET /admin/feedback/{id}/reports` — motivi delle segnalazioni (senza l'identità di chi ha segnalato)
- `GET·POST·PATCH·DELETE /admin/categories[/{id}]` — CRUD categorie
- `GET /admin/users` — cittadini attivi · `GET /admin/users/pending` — **non attivi** (normalmente vuoto)
- `POST /admin/users/{username}/approve` — (ri)abilita (→ email)
- `POST /admin/users/{username}/revoke` — **toglie l'accesso** e chiude le sessioni, senza cancellare nulla
- `DELETE /admin/users/{username}` — **rimozione completa**: pulizia dei dati + account

## 7. Notifiche email (SES)
Email transazionali da `noreply@feed.guardianelcuore.it` (identità **dominio**
verificata con **DKIM**, record nella zona `feed`). Invio sincrono **best-effort**
dentro la Lambda (un errore non fa fallire l'operazione), l'indirizzo del
destinatario è risolto da Cognito al momento (non è salvato sui feedback):
- **al cittadino**: benvenuto all'attivazione (`post-confirmation`); aggiornamento
  sulla propria proposta al **cambio stato**, alla **pubblicazione in bacheca**, a una
  **risposta pubblica** nuova o alla **correzione del testo** (`patch-feedback`);
  benvenuto anche alla ri-abilitazione manuale (`admin-users`);
- **allo staff**: **nuova proposta da moderare** (`create-feedback`, senza alcun
  contenuto della proposta: è privata, e il link porta alle non pubblicate), nuova
  iscrizione (`post-confirmation`), contenuto **segnalato**
  (`report-feedback`), proposta pubblicata o segnalata **eliminata dall'autore**
  (`feedback-owner`). I destinatari si leggono dai gruppi `admin` **e** `membro` al
  momento dell'invio, così aggiungere una persona allo staff basta a farle ricevere
  gli avvisi.

**`Reply-To` verso il recapito dell'associazione**: il mittente `noreply@` non è una
casella, e senza questo chi risponde a un avviso scrive nel vuoto senza accorgersene.

✅ **Production access concessa** (2026-07-29, 50.000/giorno): recapita a tutti. Anche
le email di **Cognito** (codice di verifica e recupero password) passano da SES con lo
stesso mittente — prima usavano il mittente condiviso di AWS e finivano in spam.

**Deliverability**: DKIM + **SPF** + **DMARC `p=quarantine`** sulla zona `feed`.
L'allineamento DMARC passa dal DKIM: SES usa un MAIL FROM su `amazonses.com`, quindi
l'SPF non è allineato. ⚠️ Non passare a `p=reject` finché non arrivano i report
(manca `rua=`): senza visibilità si scarterebbe posta legittima senza accorgersene.

Nessuna coda in v1; per robustezza futura → DynamoDB Streams + SQS.

## 7bis. Approccio IaC (CDK)

Infra in **AWS CDK/TypeScript** sotto `/infra`, **100% serverless** (niente EC2/VPC).
Convenzioni: config tipizzata per ambiente (`lib/config/`), orchestratore
`InfrastructureApp.compose()` in `lib/app.ts`, Aspects globali (Tagging + Naming),
CDK 2.176, `projectCode = GNC`.

- **Naming**: nessun nome fisico (niente `BucketName`/`TableName` custom) →
  CloudFormation genera nomi deterministici dal logical ID; gli Aspects applicano i tag.
- **Cross-stack**: si passano stringhe (ID/ARN), mai oggetti CDK. Cross-region (cert
  ACM in `us-east-1` → FrontendStack in `eu-west-1`) via ARN literal in `config`.
- **Construct** in `lib/constructs/` (un dominio = una cartella): `database/`, `auth/`,
  `api/`, `functions/`, `cdn/`, `dns/`, `storage/`.

Elenco stack e comandi: [`../infra/README.md`](../infra/README.md).

## 8. Struttura del repository (monorepo)
```
/frontend   Workspace Angular 20 (Material M3):
            projects/client (cittadini → feed.), projects/admin (backoffice →
            admin.feed.), projects/shared (modelli + AuthService condivisi)
/backend    Funzioni Lambda (TypeScript) — vedi backend/README.md
/infra      AWS CDK: Cognito, API, DynamoDB, S3, CloudFront, SES, DNS — vedi infra/README.md
/docs       Questi documenti
```
Due app su domini e distribuzioni CloudFront separati (l'admin non è raggiungibile
dal dominio client). Il workspace è multi-progetto: un solo `node_modules` e la
libreria `shared` per modelli e autenticazione comuni.

## 9. Ambienti
- **v1**: un solo ambiente `prod` (semplice, costi minimi).
- Consigliato appena possibile: un ambiente `dev` separato (stesso stack CDK, parametri diversi) per non testare in produzione.

## 10. Costi stimati (ordine di grandezza, piccolo comune)
Con poche centinaia di utenti/mese, gran parte rientra nel **free tier**:
- CloudFront/S3: pochi centesimi–€1.
- Lambda + API Gateway HTTP: quasi zero fino a decine di migliaia di richieste.
- DynamoDB on-demand: pochi centesimi.
- Cognito: gratis fino a 50k utenti attivi/mese.
- SES: ~0,10 $ ogni 1.000 email.
- **Costo mensile realistico v1: < 5 €/mese** (escluso dominio ~10–15 €/anno).

## 11. Sicurezza & GDPR
- HTTPS ovunque (CloudFront + API Gateway); least privilege IAM per ogni Lambda.
- **Header di sicurezza** sulle due distribuzioni CloudFront: HSTS (1 anno,
  sottodomini inclusi, **senza preload**), `X-Content-Type-Options`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` e una
  **CSP** con **host esatti** — mai `*.execute-api…`/`*.s3…`, perché con un carattere
  jolly basterebbe creare un'API o un bucket propri nella stessa regione per
  esfiltrare il token in `localStorage`.
  ⚠️ La CSP non ammette script inline: `optimization.styles.inlineCritical` deve
  restare **false**, altrimenti Angular emette un `onload` che viene bloccato e il
  foglio di stile globale non si applica (un controllo nel workflow di deploy lo ferma).
- **CORS** ristretto ai soli domini di produzione: nessuna origine `localhost`. Lo
  sviluppo locale passa dal **proxy del dev server** (vedi README).
- Bucket foto **privato**: upload con tipo *e dimensione* firmati (max 5 MB), lettura
  con **tipo imposto** dal server. Bucket **versionato** (recupero da cancellazioni).
- **Rate limiting** sull'HTTP API (25 req/s, burst 50) + verifica email come anti-spam.
- **Log CloudWatch a 90 giorni**: nei log finiscono indirizzi email, e il default di
  Lambda è «mai». Conservarli per sempre contraddirebbe la minimizzazione dichiarata.
- **PITR** attivo su tutte le tabelle; RETAIN su dati, utenti e foto. Sulle tabelle
  anche **protezione dalla cancellazione**: RETAIN riguarda solo ciò che fa
  CloudFormation con lo stack, questa fa rifiutare la cancellazione a DynamoDB stesso
  (`delete-table`, console). È derivata dalla `RemovalPolicy`, così un eventuale
  ambiente con `DESTROY` resta distruggibile.
- **GDPR**: informativa e regolamento pubblicati (con i dati del titolare), consenso
  obbligatorio all'iscrizione, **cancellazione account self-service** (art. 17) che
  rimuove proposte, foto, voti e segnalazioni. Nessun cookie di profilazione → nessun
  banner. Dati in UE (`eu-west-1`); OpenStreetMap è dichiarato fra i destinatari.
  ⬜ **Portabilità** (art. 20): nessuna interfaccia, per scelta — la legge non impone un
  pulsante, impone di saper consegnare i dati se richiesti. ⬜ **Età minima** non
  dichiarata.

## 11bis. Monitoraggio e avvisi
Avvisi via email a un indirizzo configurato in `config.alerts` (email + soglia budget).
- **Costi** (`CostOptimizationStack`): budget mensile **15 USD** con notifiche al
  50/80/100% della spesa reale + **previsione** oltre il 100% (avvisa se in rotta per
  sforare). Email diretta del budget (nessuna conferma richiesta).
- **Operativi** (`ApiStack`): topic SNS + 2 allarmi CloudWatch → email:
  **errori Lambda** (somma su tutte le funzioni dell'API) e **5xx dell'HTTP API**.
  La sottoscrizione SNS richiede una conferma via email una tantum.
- Costo del monitoraggio: trascurabile (allarmi entro il free tier, budget/SNS gratuiti).

## 12. Decisioni prese
- **Account AWS** `324908170418` (personale, dedicato), IAM Identity Center · **Regione** `eu-west-1`.
- **Dominio** `guardianelcuore.it` (registrato nell'account main); zona `feed.` delegata
  all'account di progetto. Certificato **ACM in `us-east-1`** per CloudFront.
- **DynamoDB multi-table** (§5) per leggibilità/manutenibilità.
- **Frontend Angular Material (M3)**, mobile-first, tema chiaro/scuro; mappa **Leaflet+OSM** (no costi).
- **Attivazione automatica** dell'iscrizione (trigger Post-Confirmation) con il
  pre-auth come interruttore per togliere l'accesso (§4). L'approvazione manuale è
  stata rimossa l'8 agosto 2026.

## 13. Fatto di recente / prossimi passi

**Fatto** (aggiornato 2026-08-09):
- contenuti privati (login obbligatorio) e proposte private di default, con la
  pubblicazione decisa dallo staff — è ciò che protegge la bacheca;
- **attivazione automatica** dell'iscrizione, con revoca dell'accesso e rimozione
  completa dal backoffice (§4);
- **SES production access** + Cognito su SES + `Reply-To` + SPF/DMARC (§7);
- **informativa privacy e regolamento** con i dati del titolare; cancellazione
  account self-service; log a 90 giorni (§11);
- **header di sicurezza** e CSP sulle distribuzioni, CORS ristretto ai domini reali,
  tetto firmato e tipo imposto sulle foto, Material Icons servito dal nostro dominio
  (Google non riceve più l'IP dei visitatori) (§11);
- **CI/CD** del frontend (GitHub Actions + OIDC) e **monitoraggio** costi, errori,
  reputazione email (§11bis);
- **169 test backend + 110 frontend** in CI, guardie validate per mutazione.

**Da fare:**
- **Report DMARC (`rua=`)** verso una casella che li riceva, poi valutare `p=reject`:
  serve prima una destinazione sul dominio. È l'unica voce rimasta in checklist.
- **i18n IT/EN** (@ngx-translate); test **e2e**; valutazione di **accessibilità**.
- (Opzionale) schermata gestione **staff** nel backoffice; email SES asincrone
  (Streams + SQS); ambiente di prova separato.
- In valutazione con l'associazione: far vedere la **bacheca pubblica in sola lettura**
  a chi si è registrato ma non è ancora abilitato.
