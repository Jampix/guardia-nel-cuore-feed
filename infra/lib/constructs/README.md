# `lib/constructs/`

Construct riusabili (L2 custom). Un construct è un gruppo coeso di risorse
AWS con default ragionati e API esplicite.

## Convenzione organizzativa

**Un dominio funzionale = una cartella**, anche se contiene un solo file.

```
constructs/
├── networking/      vpc, security-groups
├── compute/         ec2-instance
├── storage/         ebs-volume
├── monitoring/      cloudwatch
├── security/        iam-roles
└── dns/             dns-certificate
```

Mai mettere file di domini diversi flat in `constructs/`. Se aggiungi un
construct e non c'è la cartella di dominio, creala.

## Struttura di un file construct

```typescript
import { Construct } from 'constructs';
import { /* CDK imports */ } from 'aws-cdk-lib/aws-xxx';
import { ProjectConfig } from '../../config/interfaces';

export interface FooConstructProps {
  config: ProjectConfig;
  // dipendenze tipizzate (Vpc, SecurityGroup, ecc.)
}

export class FooConstruct extends Construct {
  public readonly resource: SomeResource;

  constructor(scope: Construct, id: string, props: FooConstructProps) {
    super(scope, id);
    // istanziazione risorse + sane default
  }
}
```

Regole:
- props interface sempre esportata, suffisso `Props`;
- proprietà `public readonly` solo per quello che serve davvero a chi consuma;
- niente logica di deploy (no `Stack`, no `addDependency`): quella vive negli stack;
- niente feature flag dentro: il flag si valuta nello stack o nell'orchestrator.

## Quando creare un nuovo construct

Crealo se la nuova risorsa AWS:
- viene riusata in più di uno stack, o
- ha più di 3-4 righe di configurazione che vuoi nascondere ai consumer, o
- ha default di sicurezza/encryption che vuoi imporre uniformemente.

Se è una singola risorsa con configurazione minima, può vivere direttamente
nello stack. Non sovra-astrarre: tre risorse simili sono meglio di una
factory prematura.
