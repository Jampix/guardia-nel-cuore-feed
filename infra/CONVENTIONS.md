# Convenzioni del template CDK

Questo documento descrive **come è organizzato il codice** in questo template e
**dove va cosa**. È pensato per chi parte da questo repo per un nuovo progetto
IaC e per chi lo manutiene.

Per le procedure operative (deploy, naming aziendale, monitoring) vedi
`docs/`. Per le decisioni architetturali e il loro perché vedi `docs/adr/`.

---

## 1. Layer del template

Tre layer + due moduli trasversali.

```
bin/app.ts             # entry point: carica config, istanzia InfrastructureApp
└─ lib/
   ├─ app.ts           # InfrastructureApp: orchestratore di stack
   ├─ stacks/          # boundary di deploy (1 stack = 1 CloudFormation)
   ├─ constructs/      # unità di riuso interne agli stack
   ├─ aspects/         # cross-cutting concerns (naming, tagging)
   └─ config/          # tipi, dati, validazione
```

Il flusso è sempre lo stesso:

```
bin/app.ts → loadConfig(env) → new InfrastructureApp(app, config) → compose() → stacks → constructs
                                            ↓
                                       Aspects globali (naming, tagging)
```

---

## 2. Quando creare uno stack vs un construct vs un aspect

Tre regole pratiche.

### Stack — `lib/stacks/<nome>-stack.ts`

Crea uno stack quando hai bisogno di un **boundary di deploy** distinto:
- diverso ciclo di vita rispetto al resto (es. DNS shared per tutti gli env)
- diversa region (es. certificato us-east-1 per CloudFront)
- diversa policy di distruzione (es. backup vault va `RETAIN`, l'EC2 può essere `DESTROY`)
- esposizione condizionale via feature flag (un intero gruppo di risorse on/off)

Uno stack è sempre composto da uno o più *construct*: non istanziare risorse
AWS direttamente nello stack, delega ai construct.

### Construct — `lib/constructs/<dominio>/<nome>.ts`

Crea un construct quando hai un **gruppo di risorse coese** che vuoi
potenzialmente riusare in più di uno stack o configurare in modo uniforme:
- VPC + sue subnet + NAT gateway → `VpcConstruct`
- EC2 instance + IAM role + userData → `Ec2InstanceConstruct`

I construct sono **L2 fatti in casa**: incapsulano configurazione e default
ragionati. Non contengono logica di deploy (no `Stack`, no `addDependency`).

### Aspect — `lib/aspects/<nome>-aspect.ts`

Crea un aspect quando hai una regola che **deve valere ovunque** nell'app:
- naming uniforme su tutte le risorse
- tagging coerente
- enforcement di sicurezza (es. block public access su tutti gli S3)

Gli aspect agiscono dopo la sintesi del tree, non prima. Usali con parsimonia:
sono potenti ma "magici". Documenta sempre cosa fanno.

---

## 3. Struttura di un file di construct/stack

Convenzione fissa per ogni file.

```typescript
// 1. import standard library
import { Construct } from 'constructs';

// 2. import CDK
import { Stack, StackProps } from 'aws-cdk-lib';
import { Vpc } from 'aws-cdk-lib/aws-ec2';

// 3. import locali
import { ProjectConfig } from '../config/interfaces';

// 4. props interface, sempre esportata
export interface FooStackProps extends StackProps {
  config: ProjectConfig;
  // dipendenze passate dall'orchestrator
}

// 5. classe, sempre esportata
export class FooStack extends Stack {
  // 6. proprietà pubbliche per cose che altri stack/test devono leggere
  public readonly fooConstruct: FooConstruct;

  constructor(scope: Construct, id: string, props: FooStackProps) {
    super(scope, id, props);
    // 7. corpo: solo composizione, niente risorse AWS dirette
  }
}
```

---

## 4. Naming

| Cosa | Regola | Esempio |
|---|---|---|
| Cartella construct | dominio funzionale, kebab-case | `lib/constructs/networking/` |
| File | kebab-case | `ec2-instance.ts`, `network-stack.ts` |
| Classe construct | PascalCase, suffisso `Construct` | `Ec2InstanceConstruct` |
| Classe stack | PascalCase, suffisso `Stack` | `NetworkStack` |
| Interface props | nome classe + `Props` | `Ec2InstanceConstructProps` |
| Stack ID | `<projectCode><Env><StackName>` | `MAPDevNetworkStack` |
| Resource (CFN) | applicato dal `NamingAspect` | vedi `docs/NAMING-CONVENTION.md` |

Regola di consistenza: **un dominio funzionale = una cartella**, anche se
contiene un solo file. Mai mettere file di domini diversi flat in `constructs/`.

---

## 5. Cross-stack: passare stringhe, non oggetti CDK

Quando uno stack ha bisogno di una risorsa creata in un altro stack, **passa
una stringa** (ID, ARN, allocation ID), non l'oggetto CDK.

```typescript
// ❌ NO — rischio di reference circolare
new StorageStack(app, 'Storage', { instance: compute.instance });

// ✅ SÌ — disaccoppiato
new StorageStack(app, 'Storage', {
  instanceId: compute.instance.instanceId,
  availabilityZone: compute.instance.instanceAvailabilityZone,
});
```

Motivazione completa in `docs/adr/005-cross-stack-strings-not-objects.md`.
La reference circolare succede in modo subdolo: anche solo modificare il role
o lo userData dell'oggetto passato è sufficiente a creare il ciclo.

---

## 6. Feature flag

Stack opzionali si attivano via `config.features.<nome>.enabled`. Tutto il
controllo vive in `lib/app.ts` → metodo `compose()`.

```typescript
if (this.config.features.monitoring?.enabled) {
  const monitoring = new MonitoringStack(...);
  monitoring.addDependency(compute);
}
```

Regole:
- ogni feature ha un suo blocco `if` in `compose()`, niente flag dentro gli stack;
- la feature flag è **fail-closed**: l'assenza di config disabilita la feature.

---

## 7. Validazione della config

`ConfigValidator` (in `lib/config/validator.ts`) viene chiamato da
`InfrastructureApp` *prima* di creare qualunque stack. Se la config è invalida,
si abortisce subito con un messaggio leggibile.

Tre livelli:
- **errori** (account ID malformato, project code mancante) → bloccano il deploy;
- **warning** (instance type sospetto per l'env, CIDR ridondante) → loggati;
- **suggerimenti** (cost optimization, security best practice) → loggati.

Per aggiungere una validazione: edita `lib/config/validator.ts` e aggiungi
un metodo `validateXxx(config)` che ritorna `ValidationItem[]`. Inseriscilo
nella lista in `validate()`.

---

## 8. Testing

```
test/
├── <stack>.test.ts        # un file per stack
└── helpers/               # config builder per i test
```

I test usano `Template.fromStack()` di `aws-cdk-lib/assertions`. Ogni stack
deve avere almeno un test che verifica:
- le risorse principali si creano;
- almeno un assertion di sicurezza (es. SSH chiuso quando atteso, encryption ON).

Esempio: `test/network-stack.test.ts`.

---

## 9. Aggiungere qualcosa al template

### Aggiungere un nuovo environment
1. `lib/config/accounts.ts` → aggiungi la coppia `account`+`region`.
2. `lib/config/environments/<nome>.ts` → crea la `ProjectConfig` completa.
3. `lib/config/index.ts` → aggiungi il `case '<nome>'` in `loadConfig()`.

### Aggiungere un nuovo stack
1. Crea `lib/stacks/<nome>-stack.ts` seguendo la struttura della §3.
2. Importa lo stack in `lib/app.ts`.
3. Aggiungi un blocco in `compose()` con eventuale feature flag e
   `addDependency` esplicite.
4. Scrivi un test in `test/<nome>-stack.test.ts`.

### Aggiungere un nuovo construct
1. Identifica il dominio (`networking`, `compute`, `storage`, ecc.).
   Se non esiste, crea la cartella.
2. Crea `lib/constructs/<dominio>/<nome>.ts`.
3. Esporta `<Nome>ConstructProps` e `<Nome>Construct`.
4. Importalo nello stack che lo usa.

### Aggiungere una feature opzionale
1. Estendi `ProjectConfig.features` in `lib/config/interfaces.ts`.
2. Aggiungi i valori in tutti gli `environments/<env>.ts`.
3. Aggiungi il blocco `if (config.features.X?.enabled)` in `lib/app.ts`.
4. (Opzionale) aggiungi una validazione in `lib/config/validator.ts`.

---

## 10. Cose da NON fare

- ❌ Non istanziare risorse AWS direttamente in `lib/stacks/*` o in `lib/app.ts`:
  passa sempre dai construct.
- ❌ Non passare oggetti CDK tra stack (vedi §5).
- ❌ Non duplicare la logica di config loading: usa sempre `loadConfig()`.
- ❌ Non aprire SSH a `0.0.0.0/0`. Usa SSM Session Manager o `allowedSshCidrs`
  ristretti.
- ❌ Non usare `any`. Se serve un tipo CDK, importalo.
- ❌ Non versionare i `.js`/`.d.ts` compilati: il template gira via `ts-node`.

---

## Riferimenti

- `docs/adr/` — Architecture Decision Records con il *perché* delle scelte.
- `docs/NAMING-CONVENTION.md` — naming aziendale dettagliato.
- `docs/DEPLOY.md` — procedura di deploy.
- `lib/<cartella>/README.md` — regole specifiche per cartella.
