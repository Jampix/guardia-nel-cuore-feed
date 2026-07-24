# Backend — Guardia nel Cuore

Handler **Lambda in TypeScript** (Node.js 20), impacchettati e deployati
dall'`ApiStack` CDK (`NodejsFunction`) — non c'è un server da avviare. Ogni file
in `src/handlers/` è una funzione; le rotte HTTP API e i permessi IAM (least
privilege) sono definiti in [`../infra/lib/stacks/api-stack.ts`](../infra/lib/stacks/api-stack.ts).

## Autenticazione
- **autenticata**: JWT Cognito (authorizer dell'HTTP API); l'utente è ricavato dal
  claim `sub`, mai dal body.
- **staff**: autenticata **+** controllo del gruppo `admin`/`membro` dentro l'handler
  (claim `cognito:groups`) — l'authorizer valida solo il token, non il ruolo.

> **Contenuti privati**: non esistono endpoint pubblici. Anche bacheca e categorie
> richiedono l'autenticazione → i contenuti sono visibili solo ai cittadini
> approvati e loggati (nemmeno leggibili chiamando l'API direttamente).

## Endpoint

| Metodo · rotta | Handler | Accesso | Note |
|---|---|---|---|
| `GET /categories` | `categories.ts` | autenticata | categorie attive |
| `GET /feedback/public` | `list-public-feedback.ts` | autenticata | bacheca (GSI `byVisibilita`, solo `pubblico`); `notaInterna` rimossa, `fotoUrl` prefirmato |
| `POST /feedback` | `create-feedback.ts` | autenticata | crea proposta (stato `proposta`, **sempre `privato`** — la visibilità è forzata lato server) |
| `GET /feedback/mine` | `list-my-feedback.ts` | autenticata | le proprie proposte (GSI `byAutore`) |
| `GET·POST·DELETE /feedback/{id}/vote` | `feedback-vote.ts` | autenticata | stato voto / vota / ritira; 1 voto per utente (tabella `Votes`), contatore atomico |
| `POST /uploads/presign` | `presign-upload.ts` | autenticata | URL `PUT` prefirmato per la foto (JPEG/PNG/WebP) |
| `GET /admin/feedback` | `list-admin-feedback.ts` | staff | tutti i feedback (anche privati) |
| `PATCH /admin/feedback/{id}` | `patch-feedback.ts` | staff | moderazione: `stato` / `visibilita` (pubblica/nasconde in bacheca) / `rispostaPubblica` / `notaInterna`; al cambio stato **email** all'autore (SES) |
| `GET·POST·PATCH·DELETE /admin/categories[/{id}]` | `admin-categories.ts` | staff | CRUD categorie |
| `GET /admin/users` | `admin-users.ts` | staff | cittadini attivi (gruppo `cittadino`) |
| `GET /admin/users/pending` | `admin-users.ts` | staff | iscrizioni in attesa (confermati, senza gruppo) |
| `POST /admin/users/{username}/approve` | `admin-users.ts` | staff | approva (→ gruppo `cittadino`) + **email** di benvenuto |
| `DELETE /admin/users/{username}` | `admin-users.ts` | staff | rifiuta (elimina l'account) |

### Trigger Cognito (non HTTP)
- `pre-auth.ts` — **Pre-Authentication**: blocca il login di chi non è in un gruppo
  attivo (`admin`/`membro`/`cittadino`) → i cittadini non approvati non possono accedere.

## Dati (DynamoDB)
`Feedbacks` (PK `id`; GSI `byAutore`, `byVisibilita`), `Votes` (PK `feedbackId` +
SK `userId`), `Categories` (PK `id`), `FeedbackComments` (riservata a usi futuri;
per ora nota/risposta sono denormalizzate su `Feedbacks`). Schema in
[`../docs/02-architettura-aws.md`](../docs/02-architettura-aws.md) §5.

## Foto (bucket privato)
Upload: la Lambda firma un `PUT` (`presign-upload`), il browser carica su S3 diretto.
Lettura: gli handler di lista generano un `GET` prefirmato (`fotoUrl`, ~1h) — il
bucket resta privato. Sull'item si salva solo la chiave (`fotoKey`).

## Email (SES)
Mittente `noreply@feed.guardianelcuore.it` (dominio verificato con DKIM). Invii
**best-effort** (un errore non fa fallire la richiesta): cambio stato
(`patch-feedback`) e approvazione iscrizione (`admin-users`). ⚠️ SES in *sandbox*:
recapita solo a destinatari verificati finché non è concessa la *production access*.

## Dipendenze
`@aws-sdk/*`: `client-dynamodb` + `lib-dynamodb`, `client-s3` + `s3-request-presigner`,
`client-sesv2`, `client-cognito-identity-provider`.

## Test
Unit test con **Vitest** + **aws-sdk-client-mock** (SDK AWS simulato, nessuna chiamata
reale). File `*.test.ts` accanto agli handler — non vengono inclusi nei bundle Lambda.
```bash
npm test          # esegue la suite
npm run test:watch
```
Coprono la logica critica: proposta privata di default + validazione, voto atomico
(TransactWriteItems) + idempotenza, gate staff (403/404), `notaInterna` mai esposta,
blocco login dei non approvati (pre-auth).
