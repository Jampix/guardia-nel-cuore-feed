# §IV — Organizzazione dei moduli: dall'astrazione all'implementazione

> Bozza in italiano (da tradurre in inglese). Ancorata al codice reale di `template-cdk`.
> Mentre §III definisce il modello a livelli in astratto, questa sezione mostra come ogni
> livello si materializza nell'implementazione di riferimento CDK-oriented, e quali invarianti
> di progettazione lo rendono riusabile e scalabile.

Descriviamo i quattro livelli sopra la Risorsa (Costrutto → Stack → SuperTemplate → App) nella loro realizzazione concreta. Per ciascuno enunciamo l'*invariante di progettazione* che lo rende riusabile, e lo illustriamo con frammenti dell'implementazione.

## A. Costrutto — l'unità di riuso

Un Costrutto incapsula una o più risorse dietro un'interfaccia tipizzata che accetta **configurazione, non decisioni**. L'invariante è: *un costrutto non sa in quale environment, progetto o account verrà istanziato* — riceve i parametri rilevanti via `props` e si limita a tradurli in risorse con default sicuri.

```typescript
export class VpcConstruct extends Construct {
  public readonly vpc: Vpc;
  constructor(scope: Construct, id: string, props: VpcConstructProps) {
    super(scope, id);
    this.vpc = new Vpc(this, 'VPC', {
      ipAddresses: IpAddresses.cidr(props.config.vpc.cidr),
      maxAzs: props.config.vpc.maxAzs,
      natGateways: props.config.vpc.natGateways.enabled ? props.config.vpc.natGateways.count : 0,
      enableDnsHostnames: true, enableDnsSupport: true,
      /* subnet pubbliche + private-with-egress */
    });
  }
}
```

Tre proprietà rendono il costrutto riusabile: (i) è **parametrizzato dalla config** (`props.config.vpc.cidr`, `maxAzs`, …), mai da costanti hard-coded; (ii) **espone un handle tipizzato** (`public readonly vpc`) che gli stack consumano; (iii) **non si occupa di naming né di tagging** — queste responsabilità trasversali sono delegate agli Aspect globali (§IV-C, ADR-004), così il codice del costrutto resta concentrato sulla logica di business.

## B. Stack — l'unità di deployment

Uno Stack raggruppa costrutti coerenti in un'unità di ciclo di vita deployabile, e ne pubblica gli handle e gli output. L'invariante è la **direzione esplicita delle dipendenze**: ciò che attraversa il confine di uno stack lo fa per riferimento dichiarato, mai per accoppiamento implicito.

```typescript
export class NetworkStack extends Stack {
  public readonly vpcConstruct: VpcConstruct;
  public readonly elasticIp: CfnEIP;
  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);
    this.vpcConstruct = new VpcConstruct(this, 'VPCConstruct', { config: props.config });
    this.securityGroupsConstruct = new SecurityGroupsConstruct(this, 'SGConstruct', {
      config: props.config, vpc: this.vpcConstruct.vpc,
    });
    this.elasticIp = new CfnEIP(this, 'ElasticIP', { domain: 'vpc' });
    new CfnOutput(this, 'VpcId', { value: this.vpcConstruct.vpc.vpcId, /* exportName … */ });
  }
}
```

Quando un dato deve passare *tra* stack, la metodologia impone di passarlo come **stringa** (ID, ARN, allocation-ID), non come oggetto CDK (ADR-005). Un oggetto trascina con sé i metodi che modificano la risorsa originaria, creando dipendenze inverse nascoste e, infine, riferimenti ciclici che bloccano la sintesi. Passare stringhe disaccoppia gli stack — il consumatore non si rompe se cambia il tipo concreto nel donatore — e li rende testabili in isolamento con valori finti. Questa è una delle decisioni in cui la metodologia previene *per costruzione* un'intera classe di errori (cfr. VA1, §II).

## C. SuperTemplate — l'unità di standardizzazione

Il SuperTemplate è l'intero template riusabile (configurazione + costrutti + stack + policy trasversali), il cui motore di composizione è la classe `InfrastructureApp`. Concentra in un *unico punto* tutta la logica di "quale stack si crea, quando, e da cosa dipende" (ADR-001). Il costruttore esegue tre fasi in ordine fisso:

```typescript
export class InfrastructureApp {
  constructor(private readonly app: cdk.App, private readonly config: ProjectConfig) {
    this.assertConfigValid();    // 1. valida la config, abortisce se invalida
    this.applyGlobalAspects();   // 2. applica Tagging + Naming a tutto il tree
    this.compose();              // 3. istanzia gli stack con feature flag e dipendenze
  }
}
```

Tre meccanismi del SuperTemplate realizzano la *standardizzazione*:

1. **Policy trasversali come Aspect globali** (ADR-004, ADR-006). Naming e tagging sono applicati una sola volta a tutto l'albero delle risorse, con priority `MUTATING` esplicita. È impossibile dimenticare un tag o un nome, perché nessuno li scrive risorsa per risorsa; cambiare la convenzione aziendale significa modificare un solo file.

2. **Composizione condizionale via feature flag** (ADR-002). Gli stack opzionali (monitoring, backup, dns, scheduler, cost-optimization) sono attivati da `if (config.features.X?.enabled)` dentro `compose()`. Gli stack non sanno di essere "feature-flagged": ricevono le props e si istanziano normalmente. Le feature sono *fail-closed* — assente in config significa disattivata — e le dipendenze tra stack sono sempre esplicite via `addDependency`.

```typescript
private compose(): void {
  const network = new NetworkStack(this.app, this.stackName('NetworkStack'), { config, env });
  const compute = new ComputeStack(this.app, this.stackName('ComputeStack'), {
    config, vpc: network.vpcConstruct.vpc,
    elasticIpAllocationId: network.elasticIp.attrAllocationId, env });
  compute.addDependency(network);
  if (this.config.features.monitoring?.enabled) { /* MonitoringStack */ }
  if (this.config.features.backup?.enabled)     { /* BackupStack */ }
  // … dns, scheduler, cost-optimization
}
```

3. **La configurazione come contratto** (ADR-002). Le feature attivabili sono dichiarate in `interfaces.ts`; il compilatore TypeScript segnala se un environment dimentica di dichiarare un campo previsto. Lo stato di ogni environment si legge guardando il repo, non variabili d'ambiente sparse.

## D. App — l'unità di delivery

L'App è l'istanza concreta del SuperTemplate per una tupla ⟨progetto, environment, account, region⟩. L'entry point resta deliberatamente minimale: carica la config dell'environment richiesto e istanzia il SuperTemplate.

```typescript
async function main(): Promise<void> {
  const environment = process.env.ENVIRONMENT ?? 'dev';
  const config = await loadConfig(environment);   // import() dinamico per env
  const app = new cdk.App();
  new InfrastructureApp(app, config).printSummary();
}
```

La variazione tra App vive *interamente* nei file `config/environments/{dev,staging,prod}.ts`, ciascuno dei quali estende una `commonConfig` e ne sovrascrive solo ciò che differisce: dimensioni delle istanze, CIDR, retention, feature attive. Esempio (estratto da `dev.ts`):

```typescript
export const devConfig: ProjectConfig = {
  ...commonConfig,
  environment: 'dev',
  vpc: { cidr: '10.0.0.0/22', maxAzs: 2, natGateways: { enabled: false, count: 0 } },
  compute: { web: { instanceType: 't3.medium',
    allowedSshCidrs: [],            // SSH chiuso: accesso via SSM (ADR-003)
    /* … */ } },
  features: { monitoring: { enabled: true, logRetention: Duration.days(7), alarms: false },
              backup: { enabled: false, /* … */ }, /* dns, … */ },
};
```

Il caricamento è **lazy**: `loadConfig` usa `import()` dinamico per non valutare in memoria le config degli environment che non sono target del deploy corrente. Aggiungere un environment è un'operazione a tre passi puramente dichiarativa (account in `accounts.ts`, file `environments/<nome>.ts`, case in `loadConfig`) e *nessuna modifica al codice di costrutti o stack*.

## E. Perché questa organizzazione scala

L'organizzazione realizza la tesi di §III — *standardizzazione al SuperTemplate, variazione solo in configurazione*. Le conseguenze sulla scalabilità, dimensione centrale per la conferenza, sono tre:

- **scala in numero di stack**: aggiungere uno stack tocca un solo punto (`compose()`), non lo script di ingresso né gli altri stack;
- **scala in numero di environment/account**: ogni nuova App è un file di config, a codice invariato — zero divergenza, zero fork;
- **scala in numero di progetti**: il SuperTemplate si clona e si riconfigura; le policy aziendali (naming, tagging, sicurezza di default) viaggiano col template e si aggiornano in un punto solo.

> *[Eventuale Figura 2 — diagramma di composizione: bin/app.ts → InfrastructureApp → (NetworkStack → ComputeStack → StorageStack) + stack condizionali, con le frecce di dipendenza e gli Aspect applicati globalmente.]*
