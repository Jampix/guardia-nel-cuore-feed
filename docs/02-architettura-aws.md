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

## 4. Autenticazione, ruoli e approvazione (Cognito)
- **User Pool** unico con verifica email (codice), reset password. Frontend via **@aws-amplify/auth**.
- **Gruppi**: `admin` / `membro` (staff backoffice) / `cittadino` (cittadino **approvato**).
- Il ruolo viaggia nel **JWT** → l'API Gateway usa un **Cognito Authorizer**; per le
  operazioni di backoffice ogni Lambda ricontrolla il gruppo (claim `cognito:groups`),
  perché l'authorizer valida solo la validità del token, non il ruolo.
- **Approvazione iscrizioni**: la registrazione è self-service (email + verifica), ma
  un trigger **Pre-Authentication** su Cognito **blocca il login** di chi non è in un
  gruppo attivo. Un cittadino resta quindi "in attesa" finché lo staff non lo **approva**
  dal backoffice (= aggiunta al gruppo `cittadino`); all'approvazione parte un'email SES.
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
- Prevista per una futura **cronologia** di note interne + risposte pubbliche
  (PK `feedbackId`, SK `<tipo>#<timestamp>`). In v1 **non ancora usata**: l'ultima
  nota interna e l'ultima risposta pubblica sono denormalizzate su `Feedbacks`
  (`notaInterna` / `rispostaPubblica`), sufficienti per la moderazione attuale.

## 6. Endpoint API

Rotte effettive dell'HTTP API. Mappa endpoint → handler in
[`../backend/README.md`](../backend/README.md).

**Pubblici** (nessun token):
- `GET /categories` — categorie attive
- `GET /feedback/public` — bacheca pubblica

**Cittadino** (JWT):
- `POST /feedback` — crea proposta
- `GET /feedback/mine` — le mie proposte
- `GET·POST·DELETE /feedback/{id}/vote` — stato voto / vota / ritira
- `POST /uploads/presign` — URL prefirmato per caricare una foto

**Backoffice** (JWT + gruppo `admin`/`membro`):
- `GET /admin/feedback` — tutti i feedback (anche privati)
- `PATCH /admin/feedback/{id}` — moderazione: `stato` / `rispostaPubblica` / `notaInterna` (cambio stato → email)
- `GET·POST·PATCH·DELETE /admin/categories[/{id}]` — CRUD categorie
- `GET /admin/users` — cittadini attivi · `GET /admin/users/pending` — iscrizioni in attesa
- `POST /admin/users/{username}/approve` — approva (→ email) · `DELETE /admin/users/{username}` — rifiuta

## 7. Notifiche email (SES)
Email transazionali da `noreply@feed.guardianelcuore.it` (identità **dominio**
verificata con **DKIM**, record nella zona `feed`). Invio sincrono **best-effort**
dentro la Lambda (un errore non fa fallire l'operazione), l'indirizzo del
destinatario è risolto da Cognito al momento (non è salvato sui feedback):
- **cambio stato** di un feedback → email all'autore (`patch-feedback`);
- **approvazione iscrizione** → email di benvenuto (`admin-users`).

⚠️ **Sandbox**: SES è in sandbox → recapita solo a destinatari verificati finché
non viene concessa la *production access* (richiesta inviata ad AWS). La verifica
email in **registrazione** usa invece il mittente di default di Cognito e funziona
già per tutti. Nessuna coda in v1; per robustezza futura → DynamoDB Streams + SQS.

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
- HTTPS ovunque (CloudFront + API Gateway).
- Least privilege IAM per ogni Lambda (accesso solo alla tabella/bucket necessari).
- Bucket foto **privato** (accesso solo via URL prefirmati); validare tipo/size upload.
- Informativa privacy + cancellazione account/dati (US futura da aggiungere).
- Rate limiting su API Gateway + verifica email come anti-spam base.

## 12. Decisioni prese
- **Account AWS** `324908170418` (personale, dedicato), IAM Identity Center · **Regione** `eu-west-1`.
- **Dominio** `guardianelcuore.it` (registrato nell'account main); zona `feed.` delegata
  all'account di progetto. Certificato **ACM in `us-east-1`** per CloudFront.
- **DynamoDB multi-table** (§5) per leggibilità/manutenibilità.
- **Frontend Angular Material (M3)**, mobile-first, tema chiaro/scuro; mappa **Leaflet+OSM** (no costi).
- **Approvazione iscrizioni** via trigger Cognito Pre-Authentication (§4).

## 13. Prossimi passi
- **SES production access** (uscita dalla sandbox) per recapitare le email a tutti.
- **CI/CD** (GitHub Actions) per il deploy del frontend, oggi manuale.
- **i18n IT/EN** (@ngx-translate), informativa **privacy/GDPR** + cancellazione account.
- Restringere il **CORS** del bucket foto rimuovendo `localhost` a regime.
