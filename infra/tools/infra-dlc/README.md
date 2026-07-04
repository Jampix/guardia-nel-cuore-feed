# Infra-DLC tools

Controlli (sensor) dell'harness Infra-DLC. Tooling di sviluppo, **non** parte del grafo CDK deployato.

## C2 — diff-analyzer

Sensor computazionale (pre-deploy) che **blocca un deploy** quando il diff prevede `REPLACE` o `DESTROY`
su risorse **STATEFUL** (perdita dati) o **IMMUTABLE-NAME** (nome fisico immutable → il replace rompe
Custom Resource / riferimenti). Traduce in controllo il gotcha #1 (NamingAspect non deterministico) e correlati.

- `diff-analyzer.ts` — core puro (`analyzeChanges`) + policy (liste tipi) + adapter di input.
- `../../bin/infra-dlc-diff.ts` — CLI (exit `1` = violazioni, `0` = ok, `2` = errore d'uso).
- `../../test/infra-dlc/diff-analyzer.test.ts` — test (jest).

### Uso

**Via change set CloudFormation (consigliato — robusto):**

```bash
aws cloudformation describe-change-set \
  --stack-name MyStack --change-set-name MyCs > cs.json
npm run infra-dlc:diff -- --changeset cs.json
```

**Via testo di `cdk diff` (fallback comodo):**

```bash
npx cdk diff MyStack 2>&1 | npm run infra-dlc:diff -- --cdk-diff -
# oppure da file
npm run infra-dlc:diff -- --cdk-diff diff.txt
```

**Flag:** `--warn-only` → non fallisce (exit 0) anche con violazioni; per adozione graduale.

### Esempio di output (violazione)

```
🛑 Infra-DLC C2 diff-analyzer: 1 violazione/i — deploy BLOCCATO.

[1] REPLACE — DataBucket (AWS::S3::Bucket) [stateful, immutable-name]
    REPLACE previsto su `DataBucket` (AWS::S3::Bucket). NON procedere al deploy. È una risorsa
    STATEFUL: ... Ha un nome fisico immutable: la causa tipica è un nome rigenerato ad ogni synth
    (NamingAspect non deterministico, gotcha #1). Verifica il determinism check (C1) ...
```

Il messaggio è scritto per il **consumo da parte di un LLM** (istruzione di auto-correzione, non solo allarme).

### Integrazione automatica — guard pre-deploy

`../../bin/infra-dlc-guard.ts` chiude il loop **synth → change set → analyze** senza passare file a mano:

```bash
npm run infra-dlc:guard -- MyStack --profile dev --env dev
```

Cosa fa:
1. `cdk deploy --no-execute` → crea un change set **reale** contro lo stack deployato (gestisce asset,
   parametri e bootstrap, che un `create-change-set` manuale sbaglierebbe);
2. `aws cloudformation describe-change-set` → JSON strutturato;
3. riusa il core C2 per il verdetto;
4. **pulisce** il change set (salvo `--keep-change-set`).

Flag: `--execute-if-clean` (esegue il deploy se il verdetto è pulito → deploy guidato) · `--warn-only` ·
`--keep-change-set`. Exit: `0` ok, `1` violazioni, `2` errore.

> Richiede AWS CLI + credenziali + account bootstrappato (non eseguibile offline). Gestisce il caso
> "nessun cambiamento" (change set vuoto → exit 0).

### Personalizzare la policy

Le liste `DEFAULT_STATEFUL_TYPES` / `DEFAULT_IMMUTABLE_NAME_TYPES` e `blockConditional` sono esportate e
sovrascrivibili passando un `AnalyzerPolicy` ad `analyzeChanges`/`analyze`.
