# ADR-004 — Naming e tagging via Aspects globali

**Status**: accepted

## Context

L'organizzazione ha convenzioni di naming e tagging IT che ogni risorsa
AWS deve rispettare:

- pattern di naming `{env}{os}{function}{project}{seq}{location}` per le
  risorse server-like (EC2, LB, WAF, ecc.);
- pattern legacy `{PROJECT_CODE}-{ENV}-{TYPE}-{SUFFIX}` per le altre;
- tag obbligatori `Description`, `Project`, `Environment`, `Name`,
  `ManagedBy`, `Owner`.

Applicare queste regole ad ogni `new Vpc(...)`, `new Bucket(...)`, ecc. è
ripetitivo ed error-prone: è facile dimenticare un tag su una risorsa
nuova, soprattutto quando un construct CDK ne crea molte sotto il cofano.

## Decision

Naming e tagging sono applicati come **CDK Aspects globali** in
`lib/aspects/`:

- `TaggingAspect` (`lib/aspects/tagging-aspect.ts`): aggiunge i tag
  standard a ogni risorsa taggable, con mapping automatico
  `dev → DEV`, `staging → STG`, `prod → PRD`.
- `NamingAspect` (`lib/aspects/naming-aspect.ts`): genera il nome IT-style
  per le risorse server-like, e quello legacy per le altre.

Sono applicati una volta da `InfrastructureApp.applyGlobalAspects()`. I
costruttori dei construct e degli stack non si occupano di tag o nomi.

## Consequences

**Positive**:
- impossibile dimenticare un tag o un nome: l'aspect agisce su tutto il
  tree;
- cambiare la convenzione di naming aziendale = modificare un solo file;
- il codice dei construct rimane focalizzato sulla logica di business.

**Negative**:
- gli aspect sono "magici": chi legge un `new Bucket(...)` non vede dove
  vengono aggiunti i tag. Va documentato (qui e nel `CONVENTIONS.md`).
- il debug di un naming errato richiede di leggere l'aspect, che è meno
  ovvio del leggere il costruttore della risorsa;
- gli aspect agiscono dopo la sintesi del tree: alcuni controlli che
  dipendono dal nome finale non funzionano (raro, ma possibile).

## Alternatives considerate

- **Helper function chiamata in ogni costruttore**: rifiutato perché
  reintroduce il rischio di dimenticarsene su risorse create indirettamente
  da un L2 construct.
- **Wrapper Construct base** (es. `TaggedBucket extends Bucket`): non scala
  a tutte le risorse AWS, e perde la compatibilità con i construct CDK
  esistenti.
- **`Tags.of(scope).add(...)` su ogni stack**: copre i tag ma non il naming,
  e va comunque ripetuto per ogni stack.
