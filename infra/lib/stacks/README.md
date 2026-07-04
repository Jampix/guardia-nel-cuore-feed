# `lib/stacks/`

Stack CloudFormation. Ogni file è un boundary di deploy.

| Stack | Responsabilità | Feature flag |
|---|---|---|
| `network-stack.ts` | VPC, SG, Elastic IP | sempre on |
| `compute-stack.ts` | EC2 instance + IAM role | sempre on |
| `storage-stack.ts` | EBS volume + attachment | sempre on |
| `monitoring-stack.ts` | LogGroup, Alarm, Dashboard | `features.monitoring.enabled` |
| `backup-stack.ts` | Backup Vault + Plan | `features.backup.enabled` |
| `dns-stack.ts` | Hosted Zone (shared, no env nel nome) | `features.dns.enabled` |
| `scheduler-stack.ts` | EventBridge start/stop | `features.scheduler.enabled` |
| `cost-optimization-stack.ts` | Budget + SNS alert | solo per env ≠ `dev` |

## Quando creare un nuovo stack

Stack = boundary di deploy. Crealo solo se hai bisogno di:
- un ciclo di vita diverso (deploy/destroy indipendente dagli altri stack);
- una region diversa (es. ACM cert in us-east-1 per CloudFront);
- una removal policy diversa per il gruppo di risorse;
- attivazione condizionale di un intero gruppo di risorse via feature flag.

Se le risorse condividono ciclo di vita con uno stack esistente, **mettile lì**:
non creare uno stack solo per organizzare il codice — quello è il lavoro dei
construct (vedi `../constructs/README.md`).

## Struttura di uno stack

```typescript
export interface FooStackProps extends StackProps {
  config: ProjectConfig;
  // riferimenti cross-stack: SEMPRE stringhe, mai oggetti CDK
  // (vedi CONVENTIONS.md §5 e docs/adr/005-...)
}

export class FooStack extends Stack {
  public readonly fooConstruct: FooConstruct;

  constructor(scope: Construct, id: string, props: FooStackProps) {
    super(scope, id, props);
    if (!props.config.features.foo?.enabled) return; // se condizionale

    this.fooConstruct = new FooConstruct(this, 'FooConstruct', {
      config: props.config,
      // ...
    });

    // CfnOutput per cose che altri team o stack vogliono leggere
  }
}
```

## Aggiungere uno stack

1. Crea il file qui dentro.
2. Importalo in `lib/app.ts`.
3. Aggiungi il blocco in `InfrastructureApp.compose()` con eventuale feature
   flag e `addDependency` esplicite.
4. Aggiungi un test in `test/<nome>-stack.test.ts`.
