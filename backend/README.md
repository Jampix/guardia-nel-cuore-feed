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
- **autore**: autenticata + confronto fra `sub` e `autoreId` dell'oggetto.

> **Contenuti privati**: non esistono endpoint pubblici. Anche bacheca e categorie
> richiedono l'autenticazione → i contenuti non sono leggibili nemmeno chiamando
> l'API direttamente.

⚠️ **L'authorizer non guarda i gruppi.** Un token valido apre tutte le rotte del
cittadino: chi viene rimosso dal gruppo `cittadino` resta dentro fino alla scadenza
del token. È per questo che la rimozione dell'accesso chiude anche le sessioni
(vedi `admin-users`).

## Endpoint

### Cittadino

| Metodo · rotta | Handler | Accesso | Note |
|---|---|---|---|
| `GET /categories` | `categories.ts` | autenticata | categorie attive (chi non ha il campo `attiva` è considerato attivo: i seed) |
| `GET /feedback/public` | `list-public-feedback.ts` | autenticata | bacheca (GSI `byVisibilita`, solo `pubblico`), paginata; `notaInterna` **rimossa**, `fotoUrl` prefirmato |
| `GET /feedback/mine` | `list-my-feedback.ts` | autenticata | le proprie proposte (GSI `byAutore`); la chiave viene dal **token**, non dalla richiesta |
| `POST /feedback` | `create-feedback.ts` | autenticata | crea proposta (stato `proposta`, **sempre `privato`** — la visibilità è forzata lato server); **avvisa lo staff** |
| `PATCH /feedback/{id}` | `feedback-owner.ts` | autore | modifica testo/categoria/luogo **solo se ancora privata** → `409` dopo la pubblicazione (chi ha votato l'ha fatto per quel testo) |
| `DELETE /feedback/{id}` | `feedback-owner.ts` | autore | elimina proposta + foto + voti + segnalazioni. Se era pubblicata o segnalata, **avvisa lo staff prima** di cancellare |
| `GET·POST·DELETE /feedback/{id}/vote` | `feedback-vote.ts` | autenticata | stato voto / vota / ritira; 1 voto per utente (tabella `Votes`), contatore in `TransactWriteItems` |
| `POST /feedback/{id}/report` | `report-feedback.ts` | autenticata | segnala un contenuto (1 per utente, idempotente); avvisa lo staff **solo alla prima** |
| `POST /uploads/presign` | `presign-upload.ts` | autenticata | `PUT` prefirmato per la foto; tipo fra JPEG/PNG/WebP e **dimensione firmata** (max 5 MB) |
| `DELETE /account` | `delete-account.ts` | autenticata | diritto all'oblio: cancella dati + account (vedi `lib/cancella-dati-utente.ts`) |

### Staff (backoffice)

| Metodo · rotta | Handler | Note |
|---|---|---|
| `GET /admin/feedback` | `list-admin-feedback.ts` | tutti i feedback, anche privati (Scan paginato) |
| `PATCH /admin/feedback/{id}` | `patch-feedback.ts` | moderazione: `stato` / `visibilita` / `rispostaPubblica` / `notaInterna` / **correzione di `titolo` e `descrizione`**. Legge l'item **prima** di aggiornarlo per capire cosa è cambiato davvero e non spedire un'email a ogni salvataggio |
| `GET /admin/feedback/{id}/reports` | `list-feedback-reports.ts` | motivi delle segnalazioni, **senza rivelare chi ha segnalato** |
| `GET·POST·PATCH·DELETE /admin/categories[/{id}]` | `admin-categories.ts` | CRUD categorie |
| `GET /admin/users` | `admin-users.ts` | cittadini attivi (gruppo `cittadino`) |
| `GET /admin/users/pending` | `admin-users.ts` | confermati e **non attivi**: normalmente vuoto, vi compare chi è stato rimosso o la cui attivazione non è riuscita |
| `POST /admin/users/{username}/approve` | `admin-users.ts` | (ri)abilita → gruppo `cittadino` + email di benvenuto |
| `POST /admin/users/{username}/revoke` | `admin-users.ts` | **toglie l'accesso**: rimuove dal gruppo **e chiude le sessioni aperte**. Non cancella nulla |
| `DELETE /admin/users/{username}` | `admin-users.ts` | **rimozione completa**: pulizia dei dati + eliminazione dell'account |

⚠️ Tutte le chiamate Cognito che elencano utenti sono **paginate** (60 per pagina):
senza seguire il token, oltre quella soglia l'insieme risulterebbe incompleto e i
già attivi ricomparirebbero fra i «non attivi». I due nomi di token sono
**diversi**: `NextToken` per `ListUsersInGroup`, `PaginationToken` per `ListUsers`.

### Trigger Cognito (non HTTP)

- **`post-confirmation.ts`** — appena il cittadino verifica l'email lo **attiva**
  (lo aggiunge al gruppo `cittadino`), avvisa lo staff della nuova iscrizione e gli
  conferma che può accedere. Non solleva mai: a quel punto l'utente è già confermato.
  ⚠️ L'**esito dell'attivazione viaggia nelle due email**: se l'aggiunta al gruppo
  fallisse, la persona sarebbe confermata ma incapace di entrare e nessuno lo
  saprebbe — lo staff riceve invece «Iscrizione NON attivata» e al cittadino non si
  promette un accesso che non funziona.
  ⚠️ Lo stesso trigger scatta anche dopo la conferma di un cambio password: si
  filtra su `triggerSource === 'PostConfirmation_ConfirmSignUp'`.
- **`pre-auth.ts`** — **Pre-Authentication**: consente il login solo a chi è in un
  gruppo attivo. Non è un'attesa di approvazione (l'attivazione è automatica) ma un
  **interruttore**: chi viene rimosso dal gruppo non entra più.
  ⚠️ Scatta **solo al login con password**, non sul rinnovo del token.
  ⚠️ Il pool ha `PreventUserExistenceErrors` attivo, quindi il trigger viene invocato
  **anche per email inesistenti** (`request.userNotFound`): in quel caso esce subito
  e lascia rispondere Cognito, altrimenti un indirizzo mai registrato riceverebbe il
  messaggio di account disabilitato.

## Moduli condivisi (`src/lib/`)

| Modulo | A cosa serve |
|---|---|
| `cancella-dati-utente.ts` | Rimuove tutto ciò che appartiene a un utente: proposte con foto e voti ricevuti, voti espressi altrove (con decremento dei contatori), segnalazioni fatte. Usato **sia** dal cittadino che cancella il proprio account **sia** dallo staff che rimuove una persona. **Non** tocca Cognito: l'account va eliminato *dopo*, dal chiamante |
| `ddb-paginate.ts` | `scanAll` / `queryAll`: seguono `LastEvaluatedKey` con un tetto di pagine che **logga** invece di troncare in silenzio |
| `email.ts` | `rispondiA()`: il `Reply-To` di ogni email. Il mittente `noreply@` non è una casella, quindi senza questo una risposta si perde |
| `foto-url.ts` | `urlFoto()`: URL di lettura prefirmato che **impone il tipo** con cui S3 serve il file, ricavandolo dall'estensione della chiave |
| `staff-emails.ts` | Destinatari degli avvisi allo staff, letti dai gruppi `admin` **e** `membro` al momento dell'invio, con ripiego sull'indirizzo di configurazione |

## Dati (DynamoDB)

`Feedbacks` (PK `id`; GSI `byAutore`, `byVisibilita`), `Votes` (PK `feedbackId` +
SK `userId`), `Categories` (PK `id`), **`FeedbackComments`** (PK `feedbackId` + SK
`sk`): ospita le **segnalazioni** (`sk = REPORT#<userId>`, `tipo = REPORT`). Nota
interna e risposta pubblica sono invece denormalizzate su `Feedbacks`. Schema in
[`../docs/02-architettura-aws.md`](../docs/02-architettura-aws.md) §5.

## Foto (bucket privato)

**Upload**: la Lambda firma un `PUT` (`presign-upload`), il browser carica su S3
diretto. Il client dichiara la dimensione, il server la valida e la **include nella
firma**: S3 rifiuta il `PUT` che non la rispetta, quindi il tetto di 5 MB non è una
gentile richiesta al client.

**Lettura**: gli handler di lista generano un `GET` prefirmato (~1h) — il bucket
resta privato. Sull'item si salva solo la chiave (`fotoKey`).

⚠️ **Il tipo dichiarato in scrittura NON è un vincolo**: il presigner non firma
`content-type` (verificato con l'SDK, vedi `presign-upload.firma.test.ts`), quindi
chi ha l'URL può caricare byte di qualunque natura. La difesa è **in lettura**:
`foto-url.ts` impone `response-content-type` ricavato dall'estensione della chiave —
è un parametro firmato, manometterlo nell'URL dà `403`.

## Email (SES)

Mittente `Guardia nel Cuore <noreply@feed.guardianelcuore.it>` (identità dominio
verificata con DKIM), **`Reply-To` verso il recapito dell'associazione**. SES è in
**production access** (50.000/giorno): recapita a tutti. Anche le email di Cognito
(codice di verifica e recupero password) passano da SES con lo stesso mittente.

Invii **best-effort**: un errore viene loggato e non fa fallire l'operazione;
l'indirizzo del destinatario è risolto da Cognito al momento, non salvato sui
feedback. Chi riceve cosa:

- **al cittadino** — benvenuto all'attivazione (`post-confirmation`); aggiornamento
  sulla propria proposta al cambio stato, alla **pubblicazione in bacheca**, a una
  **risposta pubblica** nuova o alla correzione del testo (`patch-feedback`, con una
  frase per stato). Mai per la sola nota interna, mai quando una proposta viene
  ri-nascosta;
- **allo staff** — **nuova proposta da moderare** (`create-feedback`), nuova
  iscrizione (`post-confirmation`), contenuto segnalato (`report-feedback`), proposta
  pubblicata o segnalata **eliminata dall'autore** (`feedback-owner`).
  ⚠️ L'avviso di nuova proposta **non contiene nulla della proposta** — né titolo, né
  testo, né il nome di chi l'ha scritta: è privata in quel momento, e il contenuto non
  deve viaggiare verso le caselle personali dello staff quando basta un clic per
  leggerlo nel backoffice. Il link punta alle **non pubblicate**, così l'avviso resta
  utile pur non dicendo nulla. Un test lo pretende.

⚠️ La schermata di moderazione invia **tutti i campi a ogni salvataggio**: «campo
presente nel body» non dice se è cambiato. Per questo `patch-feedback` confronta col
valore precedente prima di decidere se avvisare.

## Dipendenze

`@aws-sdk/*`: `client-dynamodb` + `lib-dynamodb`, `client-s3` +
`s3-request-presigner`, `client-sesv2`, `client-cognito-identity-provider`.

## Test

**169 test** con **Vitest** + **aws-sdk-client-mock** (SDK AWS simulato, nessuna
chiamata reale). File `*.test.ts` accanto al codice — non entrano nei bundle Lambda.

```bash
npm test          # esegue la suite
npm run test:watch
npx tsc --noEmit  # Vitest NON fa type-check: va lanciato a parte
```

**Ogni handler è coperto.** I test sono mirati sulle garanzie che, se cadessero,
**non darebbero errore** ma esporrebbero dati o lascerebbero fuori delle persone:

- proposta **privata di default**, validazione dei campi, coordinate nei limiti;
- `notaInterna` **mai** esposta; identità del segnalante **mai** rivelata;
- chiave della query dal **token** e non dalla richiesta;
- gate del ruolo su **tutti** i metodi, non solo in lettura;
- tipi di file non ammessi rifiutati **prima** della firma, e chiave generata dal server;
- voto atomico e idempotente;
- attivazione automatica riuscita **e fallita** (con l'avviso allo staff);
- rimozione di una persona: `sub` letto da Cognito e non presunto, pulizia **prima**
  dell'eliminazione, chiusura delle sessioni;
- paginazione (una pagina mancante = dati non cancellati in una richiesta di oblio).

Le guardie sono **validate per mutazione**: si reintroduce il difetto e si verifica
che fallisca *esattamente* il test corrispondente. Senza quella prova un test verde
non dimostra di servire.

⚠️ Due inciampi degli strumenti: `vi.mock` è issato in cima al file e non può
riferirsi a costanti dichiarate dopo (usare `vi.hoisted()`); il messaggio di
un'asserzione è il **secondo argomento di `expect`** (in Jasmine, nel frontend, è
`.withContext()`).
