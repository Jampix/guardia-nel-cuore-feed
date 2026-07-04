# Runbook — Come parte un progetto con Infra-DLC

> Percorso passo-passo per **avviare un nuovo progetto infrastrutturale** (CDK) seguendo Infra-DLC.
> Copre il **Bootstrap loop** (giorno 0) e il primo giro dell'**Increment loop** (la prima capability).
>
> **Quando usare questo runbook**: stai partendo con infra **su CDK**, **assistito da un coding agent**,
> e il progetto **vivrà e crescerà** (deploy ripetuti). Se è un sandbox usa-e-getta, è overhead: salta.

## Modello mentale in una riga

**Tu dichiari l'intento → l'agente esegue dentro i binari del template → i gate intercettano gli errori
noti → la tua attenzione va solo sulle decisioni che un controllo non può prendere** (CIDR, sicurezza, costo).

L'intento si dichiara sempre con il prefisso convenzionale: **`Usando Infra-DLC, <cosa vuoi>`**.

---

## Prerequisiti

- Un coding agent che legge le regole di repo (es. via `CLAUDE.md` / `AGENTS.md`).
- Node.js + AWS CDK + AWS CLI configurata (profilo/SSO sull'account target).
- Accesso in scrittura a un repo derivato da questo template.

---

## Loop 0 — Bootstrap (una volta per progetto)

Obiettivo: avere un progetto **scaffoldato e governabile** prima di creare qualunque risorsa.

### B1 — Derivare dal template

Parti dal template-cdk (è la "harness-template": eredita aspects, validator, config tipata, convenzioni).
Non reinventare VPC/naming/tagging: committarsi alla topologia del template è ciò che rende l'harness
possibile (Legge di Ashby).

### B2 — Identità del progetto

Decidi e fissa nella config (`lib/config/`):

| Campo | Dove | Note |
|---|---|---|
| `account` (dev/staging/prod) | `config/accounts.ts` o environments | un account per ambiente |
| `region` | config | es. `eu-west-1` |
| `projectName` | `config/common.ts` | nome esteso |
| `projectCode` | `config/common.ts` | `[A-Z]{2,10}` — entra in stack name, tag, naming |
| `owner`, `managedBy` | `config/common.ts` | tag standard (applicati dagli aspects) |

> 🚦 **Gate Design**: il `projectCode` finisce nei nomi delle risorse. Sceglilo stabile: cambiarlo dopo
> = REPLACE su risorse immutable-name (vedi mappa controllo **C5**).

### B3 — Allocazione CIDR + censimento

Scegli il CIDR della VPC **e registralo** nel registro CIDR dell'organizzazione *prima* di deployare.
Un CIDR sovrapposto rende impossibili peering/VPN futuri.

> 🚦 **Gate Design**: il censimento CIDR è un passo umano obbligatorio, non automatizzabile. Va fatto qui.

### B4 — Modello ambienti

Definisci quali ambienti esistono (`dev` / `staging` / `prod`) in `config/environments/*.ts`.
Anche se parti solo con `dev`, lascia gli altri come placeholder espliciti (non sovrascriverli a caso).

### B5 — Convenzione di naming

Scegli la convenzione (IT-naming `{env}{os}{function}{project}{seq}{location}` per le risorse server-like,
fallback `{projectCode}-{env}-{type}-{suffix}` per le altre). È già implementata negli aspects: ti basta
non disattivarla.

### B6 — Bootstrap CDK + primo synth

```bash
cdk bootstrap aws://<ACCOUNT>/<REGION> --profile <PROFILE>
npm run build && npx cdk synth
```

> 🚦 **Gate pre-synth — determinism check (C1)**: esegui `synth` **due volte** e confronta gli hash dei
> template; devono essere identici. Se differiscono, un Aspect sta generando nomi non deterministici
> (`uuidv4`/`Math.random`): vai a correggere prima di proseguire.
>
> ```bash
> npx cdk synth >/dev/null && md5 -q cdk.out/*.template.json   # run 1
> npx cdk synth >/dev/null && md5 -q cdk.out/*.template.json   # run 2 → stessi hash
> ```

Esito Loop 0: progetto compila, synth deterministico, nessuna risorsa ancora deployata.

---

## Loop 1 — Increment (per ogni capability / stack)

È il "bolt": un incremento piccolo e verificabile. Tre fasi, ciascuna con il suo gate.

### Fase DESIGN — *cosa / perché*

Dichiari l'intento:

> `Usando Infra-DLC, aggiungi la NetworkStack (VPC + subnet + security groups).`

L'agente **non scrive codice subito**: prima fa le domande di Design e produce un **change brief** (una
pagina) che contiene:

- **Blast radius**: quali risorse, quali sono stateful / immutable-name.
- **Costo delta**: stima mensile ricorrente (NATGW, endpoint, ecc.).
- **Sicurezza**: chi può raggiungere cosa; nessun `0.0.0.0/0` non giustificato.
- **CIDR/naming**: rientra nei range allocati.
- **Step manuali previsti** (se ce ne sono).
- **Piano di rollback**.

> 🚦 **Gate umano (Mob/Design)**: tu approvi il change brief. Le decisioni di business/sicurezza/costo
> sono tue — l'agente le propone, non le decide.

### Fase BUILD — *come*

Approvato il brief, l'agente implementa rispettando i binari del template:

1. Estende la **config tipata** dove serve: `interfaces.ts` + `validator.ts` + **tutti** gli
   `environments/*.ts` (non lasciarne indietro).
2. Scrive il **construct riusabile** in `lib/constructs/<dominio>/` (un dominio = una cartella).
3. Lo istanzia nello **stack** appropriato.
4. Gli **aspects** (naming/tagging) si applicano automaticamente — non aggirarli.

> 🚦 **Gate Build (computazionale)**: `tsc` verde, niente `any` impliciti, config validata.
> Anti-pattern noti bloccati: niente `Tags.of()` dentro gli aspects (usa `TagManager.setTag`, **C3**);
> niente nomi rigenerati ad ogni visit (**C4**); FlowLogs via il construct con `addDependency` (**C8**);
> Interface endpoint max 1 subnet per AZ (**C9**).

### Fase ROLLOUT — *deploy con fiducia*

```bash
npx cdk diff <Stack> --profile <PROFILE>
```

> 🚦 **Gate pre-deploy — diff-analyzer (C2)**, il più importante: leggi il `cdk diff`. **Blocca se compare
> REPLACE su una risorsa stateful o immutable-name** (bucket con dati, RDS, directory, Bucket/Function/
> Role/Policy/Alarm/LogGroup). Un REPLACE lì distrugge dati o rompe un Custom Resource. Se appare:
> non procedere → fissa un nome stabile, o `removalPolicy: RETAIN`, o scopri quale Aspect cambia il nome.
>
> Questo gate è **automatizzato**: invece di leggere il diff a mano, lancia il guard, che fa
> synth → change set → analyze e blocca (exit 1) sulle violazioni:
>
> ```bash
> npm run infra-dlc:guard -- <Stack> --profile <PROFILE> --env <ENV>
> # opzionale: --execute-if-clean per deployare solo se il verdetto è pulito
> ```

Poi deploy **staging-first**:

```bash
npx cdk deploy <Stack> --profile <PROFILE-STAGING>
# verifica esplicita in staging (smoke test) PRIMA di promuovere
npx cdk deploy <Stack> --profile <PROFILE-PROD>
```

> 🚦 **Gate Rollout**: verifica esplicita in staging prima di promuovere a prod (gate umano).
> Registra ogni **step manuale** irriducibile (domain join, acquisti Marketplace, config console) nel
> *manual-steps ledger* del progetto: non vanno dimenticati.

Esito Loop 1: capability deployata, verificata, con gli step manuali tracciati. Si ripete per la prossima.

---

## Checklist rapida dei gate

| Fase | Gate | Tipo | Cosa controlla |
|---|---|---|---|
| Design | change brief approvato | umano | blast radius, costo, sicurezza, CIDR, rollback |
| Build | `tsc` + config validata | computazionale | tipi, validator, anti-pattern aspects (C3/C4) |
| pre-synth | determinism check (C1) | computazionale | synth riproducibile (md5 identico) |
| pre-deploy | diff-analyzer (C2) | computazionale | **no REPLACE su stateful/immutable** |
| Rollout | staging-first + verifica | umano | funziona davvero prima di prod |

Dettaglio dei controlli: [`../harness/gotcha-to-sensor-map.md`](../harness/gotcha-to-sensor-map.md).

---

## Ruolo umano vs agente

- **L'agente fa**: scaffolding, scrittura construct/config, synth/diff, esecuzione dei check, deploy.
- **Tu decidi**: CIDR, postura di sicurezza, trade-off di costo, approvazione dei change brief, promozione
  a prod, e tutto ciò che richiede contesto organizzativo. L'harness automatizza la **fiducia meccanica**
  così la tua attenzione resta dove serve.

## Dopo il primo deploy — Day-2 (puntatore)

Cost review, drift detection (`cdk diff` contro il live, schedulato), verifica backup, e — quando serve —
decommission (attenzione ai vault con recovery point, **C11**, e al cleanup di stack falliti, **C10**).

---

## Stato attuale (onestà)

Oggi questo runbook è usabile come **processo + checklist**: già così chi inizia evita le trappole note.
Stato dei controlli automatici:

- **C2 (diff-analyzer)** ✅ **automatizzato** — `npm run infra-dlc:guard` (synth → change set → analyze).
- **C1 (determinism check)** — ancora manuale (doppio synth + md5); prossimo candidato all'automazione.

Gli altri gate marcati `C#` restano da automatizzare: finché non lo sono, esegui quei passi a mano
seguendo le istruzioni qui sopra (vedi mappa gotcha → sensor).
