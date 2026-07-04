# `lib/aspects/`

CDK Aspects: regole che vengono applicate **a tutto il tree** durante la
sintesi, dopo la creazione delle risorse.

| Aspect | Cosa fa |
|---|---|
| `tagging-aspect.ts` | Applica i tag standard (Project, Environment, Owner, ManagedBy, ecc.) a tutte le risorse taggable |
| `naming-aspect.ts` | Applica il naming convention (legacy + IT aziendale) a tutte le risorse named |

Gli aspect sono applicati da `InfrastructureApp.applyGlobalAspects()` in
`lib/app.ts`.

## Quando creare un aspect

Un aspect è giustificato quando hai una regola che:
- deve valere su **tutte** le risorse di un certo tipo, indipendentemente
  da chi le ha create;
- non può essere imposta tramite tipi/props (es. tagging è una proprietà
  CFN, non sempre esposta nei costruttori L2).

Esempi tipici: tagging, naming, enforcement security (es. block public access),
audit (es. log che identificano risorse non conformi).

## Quando NON creare un aspect

Non usare un aspect se la regola può essere imposta:
- da un default in un construct (es. encryption=true): mettilo nel construct;
- dalla validazione della config (es. region whitelist): mettilo in `validator.ts`.

Gli aspect agiscono *dopo* la sintesi del tree, quindi sono "magici": chi
legge il codice non vede il loro effetto direttamente nei costruttori. Usali
con parsimonia e documentali sempre.

## Struttura di un aspect

```typescript
import { IAspect, IConstruct } from 'aws-cdk-lib';

export class FooAspect implements IAspect {
  visit(node: IConstruct): void {
    // ispeziona node, applica la regola se rilevante
  }
}
```

L'aspect viene applicato globalmente con `Aspects.of(scope).add(new FooAspect(...))`.
