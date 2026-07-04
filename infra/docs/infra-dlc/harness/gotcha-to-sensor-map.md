# Filo #1 — Mappa gotcha → controllo (guide/sensor)

> **Premessa (D5)**: ogni gotcha vissuto è la **prova di un controllo mancante**. Questo file traduce i
> gotcha noti (del template e dei progetti derivati) in **guide** (feedforward) e **sensor** (feedback)
> dell'harness Infra-DLC.
>
> **Stato**: 🚧 bozza v1, da validare. Prima vogliamo confermare lo *schema*, poi rendiamo esaustiva la lista.

## Schema di una voce

| Campo | Significato |
|---|---|
| **Controllo** | `Guide` (steera prima) · `Sensor` (rileva dopo) · spesso entrambi |
| **Tipo** | `Computazionale` (deterministico, ogni change) · `Inferenziale` (LLM-judge, selettivo) |
| **Lifecycle** | `pre-synth` (sinistra) · `pre-deploy` (gate) · `post-deploy/continuo` (destra) |
| **Auto-correzione** | il messaggio che il sensor emette, **scritto per l'LLM** (non "errore X" ma "fai Y per ripararti") |
| **Stato** | `esistente` (già lo facciamo) · `parziale` · `da-costruire` |

---

## Quadro d'insieme

| # | Gotcha | Controllo principale | Tipo | Lifecycle | Stato |
|---|---|---|---|---|---|
| C1 | NamingAspect non deterministico (uuidv4) | Sensor: determinism check | Computazionale | pre-synth | esistente (manuale) |
| C2 | REPLACE su risorse stateful / immutable-name | Sensor: diff-analyzer | Computazionale | pre-deploy | **prototipo** ✅ |
| C3 | Aspect "PossibleInfiniteLoop" (Tags.of cascade) | Guide + Sensor | Computazionale | pre-synth | parziale |
| C4 | NamingAspect IT-naming non idempotente | Guide: markProcessed | Computazionale | pre-synth | parziale |
| C5 | formatProjectCode concatena projectCode+name | Sensor: naming-correctness | Computazionale | pre-synth | da-costruire |
| C6 | SLES Marketplace SSM Agent NOKEY | Guide: skill user-data SLES | Inferenziale | Build (pre-synth) | da-costruire |
| C7 | cloud-init non rilancia user-data | Guide: nota + sensor diff | Computazionale | pre-deploy | da-costruire |
| C8 | VPC Flow Logs → bucket policy race | Guide: pattern addDependency | Computazionale/Inferenziale | Build | da-costruire |
| C9 | VPCE Interface: 1 subnet per AZ | Guide/Sensor: validator | Computazionale | pre-synth | da-costruire |
| C10 | Rollback fallito con bucket pieno | Guide: skill cleanup | Inferenziale | post-deploy | da-costruire |
| C11 | cdk destroy vault con recovery point | Guide: skill decommission | Inferenziale | Day-2 | da-costruire |

---

## C1 — NamingAspect non deterministico

- **Sintomo**: ogni `cdk synth` rigenera il suffix dei fallback name → CFN vuole REPLACE su risorse immutable.
- **Root cause**: `uuidv4().substring(0,4)` invece di hash deterministico del `node.path`.
- **Controllo**: **Sensor computazionale**, `pre-synth`.
- **Implementazione**: eseguire `cdk synth` **due volte** e confrontare `md5` dei template; devono essere identici.
  Integrabile come hook pre-commit / step CI.
- **Auto-correzione**: *"Il synth non è deterministico: i template di due run consecutivi differiscono.
  Causa tipica: suffix generato con `uuidv4()`/`Math.random()` in un Aspect. Sostituiscilo con un hash
  deterministico di `resource.node.path` (md5, primi 4 char)."*
- **Stato**: esistente (lo facciamo a mano). Da promuovere a hook automatico.
- **Nota di copertura**: questo sensor cattura la *causa*; C2 cattura l'*effetto* (il REPLACE) anche per
  altre cause.

## C2 — REPLACE su risorse stateful / immutable-name

- **Sintomo**: un update fa REPLACE (non UPDATE-in-place) su bucket con dati, RDS, directory, o su risorse
  con nome immutable (Bucket/Function/Role/Policy/Alarm/LogGroup) → perdita dati / "service token not allowed".
- **Root cause**: cambio di una proprietà immutable (spesso il Name) tra deploy.
- **Controllo**: **Sensor computazionale**, `pre-deploy`. *È il sensor più importante dell'harness infra.*
- **Implementazione**: parsare l'output di `cdk diff` (o il changeset CFN), classificare le risorse come
  `stateful` / `immutable-name` (lista curata), e **bloccare** se compare `Replacement: True` su una di esse.
- **Auto-correzione**: *"`cdk diff` prevede REPLACE su `<resource>` che è STATEFUL/immutable-name: questo
  distrugge dati o rompe un Custom Resource. NON procedere. Opzioni: (a) fissa un nome esplicito stabile
  (es. `bucketName`), (b) `removalPolicy: RETAIN`, (c) verifica se un Aspect sta cambiando il nome."*
- **Stato**: **prototipo funzionante** (2026-06-19). Codice: `tools/infra-dlc/diff-analyzer.ts` (core puro
  + adapter changeset/cdk-diff) · CLI `bin/infra-dlc-diff.ts` (`npm run infra-dlc:diff`) · test
  `test/infra-dlc/diff-analyzer.test.ts` (9 verde). Liste curate stateful/immutable + messaggio di
  auto-correzione integrati. Vedi `tools/infra-dlc/README.md`.
- **Integrazione automatica** (2026-06-19): `bin/infra-dlc-guard.ts` (`npm run infra-dlc:guard -- <Stack>`)
  orchestra synth → change set (`cdk deploy --no-execute`) → `describe-change-set` → analyze → pulizia.
  Flag `--execute-if-clean` per deploy guidato. Test arg-parsing offline; il flusso completo richiede AWS.
- **Pending**: ampliare/curare le liste tipi; opzionale hook automatico pre-deploy (es. in CI o pre-commit).

## C3 — Aspect "PossibleInfiniteLoopDetected"

- **Sintomo**: `cdk synth` fallisce con loop quando lo stack cresce (>~100 risorse taggate); `Tags.of()`
  schedula un sub-aspect per risorsa → il motore Aspect riparte da root e sfora il cap di 100 restart.
- **Root cause**: tag applicati via `Tags.of()` invece che sul `TagManager`; chiamato anche su risorse
  non taggabili (es. `SecurityGroupIngress`).
- **Controllo**: **Guide computazionale** (pattern corretto) + **Sensor** (rileva l'anti-pattern).
- **Implementazione**:
  - _Guide_: regola/skill "negli Aspect usa `TagManager.setTag` (gestendo ITaggable + ITaggableV2),
    mai `Tags.of()`; skippa le risorse non taggabili".
  - _Sensor_: lint AST custom che flagga `Tags.of(` dentro `lib/aspects/`.
- **Auto-correzione**: *"Negli Aspect non usare `Tags.of(node).add()` (schedula sub-aspect → loop su stack
  grandi). Usa `TagManager.isTaggable(node) ? node.tags : isTaggableV2 ? node.cdkTagManager : skip`, poi
  `tm.setTag(k, v, 200)`."*
- **Stato**: parziale (fix nota e applicata in un progetto derivato; sensor da costruire).

## C4 — NamingAspect IT-naming non idempotente

- **Sintomo**: stesso loop; i nomi sequenziali (`...00`, `...01`, `...02`) cambiano ad ogni re-visit.
- **Root cause**: `sequentialCounters` incrementato ad ogni visit senza marker di "già processato".
- **Controllo**: **Guide computazionale**, `pre-synth`.
- **Implementazione**: helper `markProcessed(node)` che setta `cfnOptions.metadata['custom-name']=true`;
  il visit successivo skippa. Sensor: verificare presenza del marker dopo il primo apply.
- **Auto-correzione**: *"Il NamingAspect rigenera nomi ad ogni visit → loop. Marca i nodi processati
  (`cfnOptions.metadata['custom-name']=true`) e skippa quelli già marcati."*
- **Stato**: parziale (fix nota e applicata in un progetto derivato).

## C5 — formatProjectCode concatena projectCode + projectName

- **Sintomo**: il tag `Name` (naming convention) raddoppia il projectCode (es. `...DEMOAPPDEMO...` invece
  di `...DEMOAPP...`).
- **Root cause**: `(projectCode + cleanName).substring(0,10)` anche quando projectCode è già significativo.
- **Controllo**: **Sensor computazionale** (naming-correctness), `pre-synth`.
- **Implementazione**: asserzione sui nomi generati (no doppia occorrenza del projectCode) + fix della
  funzione (usa solo projectCode se ≥4 char).
- **Auto-correzione**: *"Il nome generato contiene il projectCode duplicato. `formatProjectCode` deve
  restituire il solo projectCode quando è ≥4 char, senza concatenare projectName."*
- **Stato**: da-costruire (bug noto, non bloccante).

## C6 — SLES Marketplace: SSM Agent NOKEY

- **Sintomo**: EC2 SLES running ma non si registra in SSM; boot log: `NOKEY ... Installation aborted`.
- **Root cause**: SSM Agent non preinstallato su AMI SLES SUSE + chiave GPG Amazon non importata.
- **Controllo**: **Guide inferenziale** (skill user-data), fase `Build`.
- **Implementazione**: skill "user-data SLES" che genera lo snippet con
  `zypper --non-interactive --no-gpg-checks install ...amazon-ssm-agent.rpm` + `systemctl enable --now`,
  con `{region}` risolta al synth.
- **Auto-correzione**: *"Su AMI SLES Marketplace l'SSM Agent NON è preinstallato e la GPG Amazon NON è
  importata. Nello user-data usa `zypper --non-interactive --no-gpg-checks install <rpm-regionale>` +
  `systemctl enable --now amazon-ssm-agent`."*
- **Stato**: da-costruire.

## C7 — cloud-init non rilancia user-data

- **Sintomo**: modificare lo user-data via CDK update non ha effetto se l'EC2 ha già fatto il primo boot.
- **Root cause**: cloud-init marca user-data eseguito al first boot; non rigira.
- **Controllo**: **Guide** (nota) + **Sensor** (il diff mostra solo cambio user-data → avviso).
- **Implementazione**: nel diff-analyzer, se l'unico cambio su una `AWS::EC2::Instance` è lo user-data,
  avvisare che serve replace per applicarlo.
- **Auto-correzione**: *"Hai cambiato lo user-data ma cloud-init non lo rilancia ai boot successivi. Per
  applicarlo serve terminate+recreate (cambio logical id o proprietà immutable). In dev: destroy+redeploy."*
- **Stato**: da-costruire.

## C8 — VPC Flow Logs → bucket policy race

- **Sintomo**: "BucketPolicy already exists" → rollback → bucket non vuoto → ROLLBACK_FAILED.
- **Root cause**: il delivery service AWS fa PutBucketPolicy in parallelo a CFN (L1 `CfnFlowLog`).
- **Controllo**: **Guide**, fase `Build`.
- **Implementazione**: pattern `flowLog.addDependency(bucket.policy.node.defaultChild)` + statement
  espliciti (`AWSLogDeliveryAclCheck`/`AWSLogDeliveryWrite` con `aws:SourceAccount`). Codificabile in un
  construct riusabile FlowLogs.
- **Auto-correzione**: *"Con `CfnFlowLog` su S3, dichiara `addDependency` sulla bucket policy e gli
  statement di log-delivery espliciti, altrimenti race → ROLLBACK_FAILED. Usa il construct FlowLogs."*
- **Stato**: da-costruire (construct candidato per il template).

## C9 — VPCE Interface: 1 subnet per AZ

- **Sintomo**: `Found another VPC endpoint subnet in the AZ of...` passando più subnet della stessa AZ.
- **Root cause**: un Interface endpoint accetta una sola subnet per AZ.
- **Controllo**: **Sensor/Guide computazionale** (validator), `pre-synth`.
- **Implementazione**: validazione config che, per ogni Interface endpoint, verifica al più una subnet per AZ.
- **Auto-correzione**: *"Interface endpoint con più subnet nella stessa AZ. Tieni gli endpoint in una sola
  subnet per AZ; le altre subnet li raggiungono via routing intra-VPC + private DNS."*
- **Stato**: da-costruire.

## C10 — Rollback fallito con bucket pieno

- **Sintomo**: stack in ROLLBACK_FAILED con bucket S3 dentro; l'autoDelete Lambda è già stata rimossa.
- **Controllo**: **Guide inferenziale** (skill di cleanup), `post-deploy`.
- **Implementazione**: runbook/skill "cleanup stack fallito": `aws s3 rb --force` → `delete-stack` → `wait`.
- **Auto-correzione**: *"Stack in ROLLBACK_FAILED con bucket S3: svuota prima il bucket (`aws s3 rb
  <bucket> --force`), poi `delete-stack` + `wait`. L'autoDelete Lambda non può più pulirlo."*
- **Stato**: da-costruire.

## C11 — cdk destroy: vault con recovery point (Day-2)

- **Sintomo**: `cdk destroy` non elimina il Backup Vault finché contiene recovery point.
- **Controllo**: **Guide inferenziale** (skill decommission), loop `Day-2`.
- **Implementazione**: skill "decommission" che prima fa `list-recovery-points-by-backup-vault` +
  `delete-recovery-point`, poi destroy.
- **Auto-correzione**: *"AWS Backup non elimina un vault con recovery point dentro. Prima
  `list-recovery-points-by-backup-vault` + `delete-recovery-point` per ciascuno, poi `cdk destroy`."*
- **Stato**: da-costruire.

---

## Pattern emersi (da discutere)

1. **Il diff-analyzer (C2) è il cuore**: C1, C5, C7 ci confluiscono come casi particolari. Forse il primo
   controllo da costruire davvero.
2. **Molti gotcha sono guide-as-construct**: C8 (FlowLogs), C9 (VPCE) → invece di un sensor che corregge a
   posteriori, conviene un **construct riusabile nel template** che rende l'errore non rappresentabile
   (Ashby: ridurre la varietà). _Guide forte > sensor._
3. **Le skill di Day-2/cleanup (C10, C11) sono inferenziali e runbook-like**: candidate a diventare skill
   `/cleanup-failed-stack`, `/decommission-stack`.

## Domande aperte per la review

- Lo **schema** della voce va bene così, o aggiungiamo/togliamo campi?
- Manca qualche gotcha vissuto da aggiungere?
- D'accordo a trattare il **diff-analyzer (C2)** come il primo controllo da prototipare?
