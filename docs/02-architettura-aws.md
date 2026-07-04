# Specifiche Architetturali — Guardia nel Cuore

> Fase **Construction** (AI-DLC, versione leggera).
> Stato: **BOZZA da rivedere** — v0.3 · 04/07/2026
> Riferimento funzionale: `01-specifiche-funzionali.md` (v1.0)
>
> **Avanzamento costruzione:**
> - ✅ Incremento 1 — Fondamenta IaC: fork template in `/infra`, pulizia EC2/VPC, config `GNC`/`prod`/`eu-west-1`. `tsc`+`validate`+`synth`+`jest` verdi.
> - ✅ Incremento 2 — **DEPLOYATO** su account `324908170418` (eu-west-1): `DataStack` (4 tabelle DynamoDB) + `AuthStack` (Cognito). Aspects resi deterministici (rimosso naming uuid + tag CreatedDate). Determinism check: due synth identici.
> - ✅ Incremento 3 — **DEPLOYATO**: `ApiStack` (HTTP API + JWT authorizer Cognito) + 2 Lambda (`GET /categories` pubblica, `POST /feedback` autenticata). Codice in `/backend`. Verificato: categories 200, feedback senza token 401, invoke diretta create-feedback → 201 + item scritto in DynamoDB.
> - ⬜ Incremento 4 — CertStack (us-east-1) + FrontendStack + DNS + app Angular
>
> **Output deployati:**
> - Cognito User Pool: `eu-west-1_8tDpBt93Z`
> - App client (cittadini): `1g6b1d8p5s6m82vrp1id53gkm2` · (admin): `3ba3hvlq6rtl7dlj476veee8mu`
> - **API URL**: `https://dex1zyd5pe.execute-api.eu-west-1.amazonaws.com`
> - Tabelle: nomi auto-generati (vedi output stack `GNCProdDataStack`).
>
> ⚠️ **Prima del go-live**: cambiare `RemovalPolicy.DESTROY` → `RETAIN` in `DataStack` e `AuthStack` per non perdere dati/utenti.

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

## 4. Autenticazione e autorizzazione (Cognito)
- **User Pool** unico con verifica email + OTP, reset password.
- **Gruppi**: `cittadino` (default all'iscrizione), `membro`, `admin`.
- Il ruolo viaggia nel **JWT** → l'API Gateway usa un **Cognito Authorizer**; ogni Lambda controlla il gruppo per le operazioni riservate (backoffice/admin).
- Il frontend usa la libreria **@aws-amplify/auth** (solo il modulo Auth) per login/registrazione.

## 5. Modello dati DynamoDB (multi-table)

Scelta: **poche tabelle separate e leggibili** (billing on-demand). Prefisso nomi con l'ambiente, es. `gnc-prod-*`.

### Tabella `Feedbacks`
- **Chiave primaria**: `id` (partition key).
- Attributi: `titolo`, `descrizione`, `categoriaId`, `stato`, `visibilita` (`pubblico`|`privato`), `fotoUrl`, `lat`, `lng`, `luogo`, `numeroVoti`, `autoreId`, `autoreNick`, `lingua`, `createdAt`, `updatedAt`.
- **GSI1 `byAutore`** (US-06 "i miei feedback"): PK `autoreId`, SK `createdAt`.
- **GSI2 `byVisibilita`** (US-07 bacheca pubblica): PK `visibilita`, SK `createdAt`. Ordinamento "più votati" fatto lato client o con una scan+sort a questo volume.

### Tabella `Votes`
- **Chiave composta**: PK `feedbackId`, SK `userId` → garantisce **1 voto per utente per feedback** (write condizionata).
- Attributo: `createdAt`.
- Il conteggio è denormalizzato su `Feedbacks.numeroVoti` (aggiornato con `UpdateItem ADD` in modo atomico), così la bacheca non conta i voti a ogni lettura.

### Tabella `Categories`
- **Chiave primaria**: `id`.
- Attributi: `nome`, `attiva` (bool), `creatoDa`, `createdAt`.

### Tabella `FeedbackComments` (note interne + risposte pubbliche)
- **Chiave composta**: PK `feedbackId`, SK `<tipo>#<timestamp>` con `tipo` ∈ {`NOTE`, `REPLY`}.
- Attributi: `autoreId`, `testo`, `pubblica` (bool derivata dal tipo).
- Una singola query per `feedbackId` restituisce note + risposte di quel feedback (nel dettaglio backoffice).

## 6. Endpoint API (bozza)

Pubblici / cittadino (autenticato):
- `POST /feedback` — crea feedback (con visibilità pubblico/privato)
- `GET /feedback/mine` — i miei feedback
- `GET /feedback/public` — bacheca pubblica (con ordinamento/filtri)
- `POST /feedback/{id}/vote` / `DELETE /feedback/{id}/vote` — vota / annulla voto
- `GET /categories` — categorie attive
- `POST /uploads/presign` — ottieni URL prefirmato per caricare una foto

Backoffice (gruppo `membro`/`admin`):
- `GET /admin/feedback` — tutti i feedback con filtri
- `PATCH /admin/feedback/{id}/status` — cambia stato (→ trigger email)
- `POST /admin/feedback/{id}/note` — nota interna
- `POST /admin/feedback/{id}/reply` — risposta pubblica
- `POST /categories` `PATCH /categories/{id}` — gestione categorie (membro/admin)

Admin (gruppo `admin`):
- `GET /admin/users` — elenco utenti (via Cognito)
- `POST /admin/members` — invita/abilita un membro

## 7. Notifiche email (SES)
Al cambio stato (`PATCH .../status`) la stessa Lambda invia l'email al cittadino via **SES** (template IT/EN in base alla lingua preferita).
- v1: SES in **sandbox** → serve verificare il dominio/mittente e (in sandbox) i destinatari; per andare in produzione va richiesta l'uscita dalla sandbox.
- Nessun sistema di code per la v1: invio sincrono. Se in futuro serve robustezza → DynamoDB Streams + SQS.

## 7bis. Approccio IaC — fork del template CDK aziendale

Base: **fork del template `template-cdk`** (di proprietà dell'utente) dentro `/infra`, mantenendo le sue convenzioni e rimuovendo il superfluo EC2.

**Cosa manteniamo dal template:**
- Config tipizzata per ambiente (`lib/config/` + `environments/{dev,prod}.ts`), orchestratore `InfrastructureApp.compose()`, `ConfigValidator`.
- Aspects globali **TaggingAspect** + **NamingAspect** (applicati a tutti gli stack).
- Tooling `infra-dlc` (guard sui diff), script `deploy:*`/`validate:*`, ADR.
- CDK 2.176 · Node/TS via `ts-node` · `projectCode = GNC`, `projectName = guardia-nel-cuore`.

**Cosa rimuoviamo (non serve, siamo serverless senza VPC):**
- Stack: `network`, `compute`, `storage` (EBS), `backup`, `scheduler`.
- Construct: `networking/vpc`, `networking/security-groups`, `compute/ec2-instance`, `storage/ebs-volume`.
- Manteniamo/riadattiamo: `dns` (Route53), `monitoring` (base), `cost-optimization` (budget alert).

**Naming risorse serverless:** NON impostiamo nomi fisici (niente `BucketName`/`FunctionName`/`TableName` custom) → CloudFormation li genera dal logical ID (deterministici, superano il *determinism check* di infra-dlc). L'aspect applica comunque **tutti i tag** standard.

**Nuovi construct serverless** in `lib/constructs/` (un dominio = una cartella):
`database/` (DynamoDB), `auth/` (Cognito), `api/` (HTTP API + integrazioni), `functions/` (Lambda), `cdn/` (S3 sito + CloudFront), riuso di `dns/dns-certificate` per ACM.

**Nuovi stack** in `lib/stacks/` orchestrati in `compose()`:
- `DataStack` → tabelle DynamoDB (`Feedbacks`, `Votes`, `Categories`, `FeedbackComments`).
- `AuthStack` → Cognito User Pool + gruppi `cittadino`/`membro`/`admin` + client.
- `StorageStack` → bucket S3 privato per le foto.
- `ApiStack` → HTTP API + Lambda + Cognito JWT authorizer (dipende da Data/Auth/Storage).
- `CertStack` → ACM in **`us-east-1`** (stack separato, `env:{region:'us-east-1'}`).
- `FrontendStack` → S3 sito statico + CloudFront (usa l'ARN cert cross-stack come stringa).

## 8. Struttura del repository (monorepo)
```
/frontend-client  → app Angular cittadini   → feed.guardianelcuore.it
/frontend-admin   → app Angular backoffice   → admin.feed.guardianelcuore.it
/backend          → funzioni Lambda (TypeScript) + logica dominio
/infra            → AWS CDK (fork del template): Cognito, API, DynamoDB, S3, CloudFront, SES, DNS
/docs             → questi documenti
```
Due frontend distinti (client/admin) su domini e distribuzioni CloudFront separati → migliore separazione e sicurezza (l'admin non è raggiungibile dal dominio client).

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
- **Account AWS**: `324908170418` (personale, dedicato). Accesso via IAM Identity Center.
- **Regione**: `eu-west-1` (Irlanda).
- **Dominio**: già registrato → collegare a CloudFront con certificato **ACM in `us-east-1`** (CloudFront richiede il certificato in Virginia anche se il resto è in Irlanda).
- **DynamoDB**: **multi-table** (4 tabelle, §5) per leggibilità e manutenibilità.

### Nota residua
- Qual è esattamente il **nome del dominio** registrato? (serve per configurare ACM + CloudFront)
