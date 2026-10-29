# CLAUDE.md — Guardia nel Cuore · feedback civico

Istruzioni per chi (persona o agente) lavora su questo repository. Il README spiega
**cosa fa** l'app; questo file spiega **come ci si lavora senza romperla**: scelte fatte
e perché, comandi, trappole già pagate, lavori aperti.

> ⚠️ **Il repository è PUBBLICO.** Non scrivere qui né nei commit: email di staff o di
> cittadini, ID di risorse AWS, ARN, codici fiscali, token, dati di produzione. Gli
> identificativi si leggono dagli output degli stack CDK.

---

## 1. Cos'è, in una riga

App web serverless (AWS, `eu-west-1`) con cui chi ha Guardia Piemontese nel cuore invia
proposte e segnalazioni all'**associazione** Guardia nel Cuore (non al Comune), più un
backoffice per lo staff. **In produzione dal 22/07/2026**, unico ambiente: `prod`.
Costo d'esercizio di fatto nullo (free tier), budget di allarme 15 USD.

- Cittadini: `https://feed.guardianelcuore.it`
- Backoffice: `https://admin.feed.guardianelcuore.it`

## 2. Architettura

```
Angular 20 SPA (client + admin)  →  S3 + CloudFront (header di sicurezza + CSP)
        │ JWT Cognito
        ▼
API Gateway HTTP  →  Lambda Node 24 / TypeScript (16: 14 API + 2 trigger Cognito)
                       ├─ DynamoDB: Feedbacks, Votes, Categories, FeedbackComments
                       ├─ S3: foto (bucket privato, URL prefirmati in PUT e GET)
                       ├─ Cognito: un pool, gruppi admin / membro / cittadino
                       │    trigger Pre-Authentication  = interruttore d'accesso
                       │    trigger Post-Confirmation   = attivazione + avvisi
                       └─ SES: tutte le email (anche quelle di Cognito)
```

| Cartella | Contenuto |
|---|---|
| `frontend/` | Workspace Angular 20 + Material M3: `projects/client`, `projects/admin`, `projects/shared` |
| `backend/` | Handler Lambda in `src/handlers/`, moduli comuni in `src/lib/`; test accanto ai file (`*.test.ts`) |
| `infra/` | AWS CDK (`lib/app.ts`, `lib/stacks/`, `lib/constructs/`, `lib/config/environments/prod.ts`) |
| `docs/` | `01-specifiche-funzionali.md`, `02-architettura-aws.md`, `brochure/` (versione da stampa) |

**Stack CDK** (prefisso `GNCProd`): `DataStack` (4 tabelle) · `AuthStack` (pool + trigger) ·
`StorageStack` (foto) · `ApiStack` (HTTP API, Lambda, allarmi) · `DnsStack` (zona `feed.`,
DKIM/SPF/DMARC) · `CertStack` (us-east-1) · `FrontendStack` (2 bucket + 2 CloudFront) ·
`CiStack` (ruolo OIDC per GitHub Actions) · `CostOptimizationStack` (budget).

L'infra deriva da un template CDK con `NamingAspect` e `TaggingAspect` (in
`infra/lib/aspects/`): `projectCode=GNC`, `projectName=guardia-nel-cuore`.

## 3. Scelte fatte, e perché

**Accesso e moderazione**
- **Iscrizione self-service con attivazione automatica** alla verifica dell'email
  (Post-Confirmation aggiunge al gruppo `cittadino`). L'approvazione manuale è stata
  tolta l'8/08/2026: con due o tre persone in staff era un collo di bottiglia, e a
  luglio 6 cittadini sono rimasti settimane in attesa senza saperlo.
  *Conseguenza accettata*: il **voto è meno affidabile** (basta un'email per sostenere).
  Se i sostegni sembrano gonfiati, la causa è questa, non un bug.
- **Le proposte nascono private** e solo lo staff le pubblica in bacheca: è questo che
  protegge la bacheca dallo spam, non l'iscrizione.
- **Tutto dietro login** tranne `/guida`, `/regolamento`, `/privacy`.
- **Pre-Authentication è un interruttore**, non una sala d'attesa: chi non è in un gruppo
  attivo non entra.
- **Gruppi `admin` e `membro` hanno gli stessi poteri.** Non c'è UI per gestire lo
  staff: si fa da CLI o console Cognito.
- Il cittadino **modifica** la propria proposta solo finché è privata (chi ha votato
  l'ha fatto per quel testo); può **eliminarla** sempre, ma se era pubblicata o aveva
  segnalazioni aperte lo staff viene avvisato **prima** della cancellazione (altrimenti
  eliminare sarebbe una via di fuga dalla moderazione).

**Email**
- Tutte le email partono da SES sul dominio (`noreply@feed.…`), anche verifica e
  recupero password di Cognito (`EmailSendingAccount: DEVELOPER`): con il mailer di
  default di Cognito finivano in spam. Reply-To = recapito dell'associazione
  (`config.contactEmail`, letto da env **a ogni chiamata** in `backend/src/lib/email.ts`).
- Gli avvisi allo staff vanno a **tutti** gli admin (`backend/src/lib/staff-emails.ts`),
  non a un indirizzo fisso.
- **Nell'avviso «nuova proposta» allo staff non c'è nulla della proposta** (titolo,
  testo, luogo, autore). Scelta deliberata: la proposta è privata e non deve viaggiare
  verso caselle personali. **Un test lo pretende.**
- Gli invii sono **best-effort**: l'operazione riesce anche se l'email fallisce.
  Eccezione: se l'attivazione nel Post-Confirmation fallisce, lo staff riceve
  «Iscrizione NON attivata — serve un intervento» e al cittadino non si promette
  l'accesso. Il trigger **non solleva mai**.
- L'email di aggiornamento al cittadino parte quando cambia ciò che vede (stato,
  risposta pubblica, pubblicazione, correzione del testo). L'handler `patch-feedback`
  fa un **GetItem prima dell'Update** e confronta, perché il backoffice manda tutti i
  campi a ogni salvataggio.

**Sicurezza e privacy**
- Header + **CSP stretta** con host esatti su entrambi i siti; `frame-ancestors 'none'`.
- CORS solo verso i domini di produzione; in sviluppo si passa dal **proxy** del dev
  server (`frontend/proxy.conf.json`), niente `localhost` nel CORS.
- Upload foto: il server valida e **firma `ContentLength`** (tetto 5 MB applicato da S3).
- Log a 90 giorni, PITR, `RemovalPolicy.RETAIN` e **deletion protection** sulle tabelle.
- Mappe con **Leaflet + OpenStreetMap**, geocoding con **Nominatim** (gratis, senza
  chiavi). L'informativa dichiara che IP e indirizzi passano a OSM: **non scrivere mai
  «i dati non escono dall'UE»**.
- Diritto all'oblio: `DELETE /account` cancella proposte, foto, voti e poi l'utente
  Cognito **per ultimo**. Il `sub` si **legge** con `AdminGetUser`, non si presume
  uguale allo username; se non si ricava → 500 e non si cancella nulla.
- Età minima non dichiarata e portabilità dei dati non implementata: **scelte
  dell'utente**, non dimenticanze.

**UI**
- Angular 20 standalone + Angular Material (M3) per entrambi i frontend, stesso tema.
  Scartati Tailwind/DaisyUI e PrimeNG.
- **Mobile-first anche per l'admin**, ogni oggetto in una card, stile iOS.
- Palette: primario `#C0392B`, secondario `#E67E22`, neutri `#FAF6F5` / `#2B2321`.
- Auth con `@aws-amplify/auth` (solo il modulo Auth).

## 4. Comandi

### Prerequisiti
- **Frontend: Node 22** (`nvm use 22`). La CLI Angular si invoca **sempre** con
  `npx ng` (quella globale, se c'è, è vecchia).
- **Backend: Node 24** (lo stesso runtime delle Lambda; la CI usa 24).
- **Infra**: CDK locale in `infra/` (`aws-cdk` 2.1144.0, `aws-cdk-lib` 2.272.0), mai
  globale. Node 26 dà un avviso jsii (non supportato).
- AWS: profilo SSO `guardia-nel-cuore` → `aws sso login --profile guardia-nel-cuore`.
  Il token scade spesso.

### Test
```bash
cd backend  && npm test                   # Vitest, ~169 test, SDK AWS simulato
cd backend  && npx tsc --noEmit           # Vitest NON fa type-check: lanciarlo sempre
cd frontend && nvm use 22 && npm run test:ci   # Karma su Chrome vero, client + admin
cd infra    && npm test                   # Jest sugli stack
```
CI: `.github/workflows/test.yml` su push a `main` e PR che toccano `backend/**` o `frontend/**`.

### Sviluppo locale (frontend)
```bash
cd frontend && nvm use 22 && npm install
npx ng serve client --port 4200
npx ng serve admin  --port 4300
```
Non c'è backend locale: il proxy inoltra all'API di produzione (dati veri!).
**L'upload foto non è provabile in locale** (il PUT va dritto a S3): serve riaggiungere
`http://localhost:4200` in `infra/lib/app.ts` e rideployare StorageStack, poi toglierlo.

### Deploy infrastruttura e backend (manuale)
```bash
cd infra && npm install
# se CDK non vede le credenziali SSO (scadono per CDK prima che per la CLI):
eval "$(aws configure export-credentials --profile guardia-nel-cuore --format env)"
ENVIRONMENT=prod npx cdk diff   GNCProd<Stack> --profile guardia-nel-cuore < /dev/null
ENVIRONMENT=prod npx cdk deploy GNCProd<Stack> --profile guardia-nel-cuore
```
Il codice Lambda è impacchettato da `NodejsFunction` partendo da `backend/src/handlers`.
**Il deploy in produzione lo lancia l'utente**, non l'agente (in auto-mode viene
bloccato comunque): preparare il comando, l'utente lo esegue con `!`.

### Deploy frontend (automatico)
Push su `main` che tocca `frontend/**` → `.github/workflows/deploy-frontend.yml`
(build, `s3 sync`, invalidazione CloudFront) via **OIDC**, nessuna chiave nei secret.
Lancio a mano: `gh workflow run` dall'account GitHub proprietario del repo.

## 5. Cose da NON fare

- **Non cancellare un utente dalla console Cognito**: non esegue la pulizia dell'app,
  e proposte, foto, voti e segnalazioni restano orfani. Usare «rifiuta» dal backoffice
  o «elimina account» dall'app.
- **Non togliere l'accesso dalla console senza «Sign out user»**: il gate scatta solo
  al login con password, non al rinnovo del token (refresh token = 30 giorni). Il
  backoffice («Rimuovi accesso») fa già `AdminUserGlobalSignOut`.
- **Non dichiarare `given_name`/`family_name` in `standardAttributes`** del pool: l'update
  fallisce con *Invalid AttributeDataType* (esistono già). Gli attributi custom
  (`custom:tipoUtente`, `maxLen: 32`) **non si possono rinominare né eliminare**. Ogni
  modifica al pool: prima `cdk diff` per verificare che sia *in place* e non una
  sostituzione (ci sono utenti veri).
- **Non mettere `apiUrl` a `''`** nel frontend: l'interceptor manda il JWT a ogni URL
  che inizia con `apiUrl` → il token finirebbe su S3 e Nominatim. C'è un test.
- **Non riattivare `inlineCritical`** nel build di produzione (`angular.json`): con la
  CSP il foglio globale resta su `media=print` e gli stili non si applicano, ma la
  pagina di login sembra integra. Non «risolvere» con `'unsafe-inline'`.
- **Non servire con `immutable` un file dal nome fisso** (favicon, icone, font senza
  hash): resterebbe vecchio nei browser per un anno. Nomi versionati
  (es. `material-icons-v145.woff2`) o esclusione nel workflow.
- **Non passare il DMARC a `p=reject`** finché non arrivano i report (`rua=`).
- **Non scrivere `--` dentro commenti XML/SVG** (es. citando `--mat-sys-primary`):
  il file diventa XML non valido.
- **Non usare `git checkout <file>` per annullare una mutazione** se il fix su quel file
  non è committato: si perde anche il lavoro buono.
- **Non incollare la brochure (`docs/brochure`) nell'app**: è a misura A4. `/guida` ne
  riusa il contenuto. Sono **due copie**: se cambia l'una, va cambiata l'altra
  (`features/documenti.spec.ts` ne controlla una parte).

## 6. Trappole note (comportamenti corretti che sembrano guasti, e viceversa)

- Gli **«Errors» della PreAuthFn non sono guasti**: il trigger blocca lanciando
  un'eccezione, ogni blocco legittimo conta come errore Lambda.
- Il **401 su `/feedback/public` è corretto**: `public` è la visibilità dei feedback
  elencati, non della rotta (che è autenticata).
- Nei dati la visibilità vale `pubblico` / `privato` (non `public`); `fotoKey` può
  essere assente.
- Con `PreventUserExistenceErrors=ENABLED` Cognito invoca il Pre-Authentication **anche
  per email non registrate**: il trigger deve gestire l'utente inesistente.
- Post-Confirmation scatta anche su `PostConfirmation_ConfirmForgotPassword`: filtrare
  su `triggerSource === 'PostConfirmation_ConfirmSignUp'`.
- Nel presigner S3 il **`content-type` non è firmato**: il tipo dichiarato non è un
  vincolo, decide solo l'estensione. `ContentLength` invece sì (test con il presigner
  vero in `presign-upload.firma.test.ts`).
- Le chiamate che elencano (Cognito `ListUsers`/`ListUsersInGroup`, Scan/Query DynamoDB)
  devono essere **paginate**: un tempo non lo erano e oltre il limite di pagina gli utenti
  sparivano in silenzio. Per DynamoDB c'è `backend/src/lib/ddb-paginate.ts`.
- Tabella importata con `fromTableArn` → `grantReadData` non copre i GSI: usare
  `fromTableAttributes({ tableArn, grantIndexPermissions: true })`. Un handler che fa
  GetItem prima di scrivere serve `grantReadWriteData`, non `grantWriteData`.
- Nuovo metodo HTTP → aggiungerlo a `CorsHttpMethod` in `constructs/api/http-api.ts`
  (con `PATCH` mancante il salvataggio riusciva ma il browser mostrava errore).
- Un commento in un handler cambia l'hash del bundle: il `cdk diff` di ApiStack mostra
  `[~] Code` e va deployato per tornare a zero.
- Variabili in `api-stack.ts` usate prima della dichiarazione → `TS2448`: tenere la
  config in cima al costruttore.
- `frontend/README.md` ricade nel filtro `frontend/**`: un commit di sola doc lì fa
  partire il deploy del frontend (innocuo).
- **Ordine di rilascio** quando cambia la CSP insieme agli asset: prima il frontend
  (CI), poi lo stack con la CSP.
- Aggiornamento CDK: `projectRoot` e `depsLockFilePath` in
  `constructs/functions/node-function.ts` puntano a `backend/` (altrimenti
  `PathNotUnderRoot`); **esbuild** è devDependency del backend e deve restare in linea
  con il peer di vite/vitest (oggi 0.28.x), o `npm ci` fallisce in CI anche se in
  locale passa. Il `TaggingAspect` usa `TagManager.setTag` per evitare
  `PossibleInfiniteLoopDetected`.

**Angular / Material**
- `<mat-error>` dentro `@if` annidati non viene proiettato sotto il campo: usare una
  catena piatta `@if / @else if`.
- Hint/errori su due righe sbordano sul campo successivo: fix condiviso in
  `projects/shared/styles/_form-field.scss`.
- `.notice` è flex: il testo di un banner va in **un solo `<span>`**.
- La mappa deve reagire alle coordinate che arrivano dopo l'init (c'è un `effect`).

**Test**
- Backend (Vitest): `vi.mock` è issato → usare `vi.hoisted()`; il messaggio di
  un'asserzione è il 2° argomento di `expect`. Con `aws-sdk-client-mock` la **prima**
  risposta registrata vince: `reset()` prima di ridefinire nel test. I mock di
  `AdminGetUser` devono restituire il `sub`, come Cognito vero.
- Frontend (Jasmine/Karma): messaggio con `.withContext(...)`; `provideRouter([])` vuoto
  riempie l'output di `NG04002` → `provideRouter([{ path: '**', children: [] }])`;
  `fixture.nativeElement` è `any`, tipizzare un `root: HTMLElement`.

**Verifiche operative**
- Ogni guardia si valida **per mutazione**: reintrodurre il difetto e vedere fallire
  *esattamente* il test atteso. Controllare che la mutazione colpisca davvero il
  bersaglio (`perl -pi 's/…/…/'` senza `/g` cambia solo la prima occorrenza del file).
- Asserire sull'**esito** (la tabella è ancora `ACTIVE`?), non su un messaggio d'errore
  indovinato.
- Prove in produzione: eventi sintetici con `aws lambda invoke`, indirizzi
  `success+…@simulator.amazonses.com`, dati di prova **sempre rimossi**. Attenzione:
  alcuni flussi mandano email vere allo staff.
- Verifica visiva: **Chrome vero via CDP** (`Emulation.setDeviceMetricsOverride` *prima*
  di `Page.navigate`). Non con `<iframe>` (bloccato da `frame-ancestors`), e
  `--window-size` in headless non cambia il viewport di layout.
- CloudWatch: con `--period 604800` si legge un solo bucket parziale; usare
  `--period 86400` e sommare.
- `aws dynamodb get-item` su elemento assente non stampa nulla (o `None` con
  `--output text`): trattare l'uscita vuota come assenza.
- zsh non spezza le variabili non quotate: `aws … $P` con più flag in `P` non funziona.
- DNS della zona: negative cache 24h; per la verità usare `aws route53 test-dns-answer`.

## 7. Lavori in sospeso

1. **DMARC `rua=`**: unica voce rimasta della checklist di lancio. Su `feed.` non esiste
   un record MX, quindi serve prima una casella che riceva i report (SES inbound o
   servizio esterno). Poi valutare `p=reject`.
2. **In valutazione con gli associati**: bacheca pubblica in sola lettura per chi non è
   ancora abilitato (stima: mezza giornata backend + mezza frontend).
3. **Pulizie piccole**: una foto orfana di prova nel bucket e nessuna regola di scadenza
   per le foto caricate senza proposta; alcuni log group delle Lambda interne CDK senza
   scadenza; log group OIDC duplicati nel CiStack; utenti `UNCONFIRMED` mai verificati.
4. **Proposte duplicate** che si dividono i sostegni: decisione dello staff (unire o no).
5. Mitigazione upload: `ResponseContentType` / `ResponseContentDisposition` sui GET
   prefirmati, per servire sempre come immagine qualunque cosa sia stata caricata.
6. API CDK deprecate da sostituire: PITR, `logRetention`, `addDependency`.
7. README ancora con «Node.js 20» nello schema dell'architettura: le Lambda sono su Node 24.
8. Opzionali: i18n IT/EN, test end-to-end, valutazione accessibilità, UI di gestione
   staff, email SES asincrone, ambiente di prova separato, `Permissions-Policy`.

## 8. Modo di lavorare

- Un passo per volta, con conferma, sulle modifiche multi-file; spiegare il perché di un
  servizio o una dipendenza nuova **prima** di scrivere codice.
- Dopo ogni fix: test, commit, push. Commit in italiano, descrittivi del *perché*.
  Si lavora su `main`.
- Niente `Co-Authored-By` nei commit.
- Dopo un deploy: `cdk diff` di nuovo a zero, verifica in produzione, dati di prova rimossi.
