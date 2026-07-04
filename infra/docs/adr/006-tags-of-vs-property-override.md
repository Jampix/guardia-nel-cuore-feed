# ADR-006 — Tag Name via `Tags.of()`, priority Aspects esplicita

**Status**: accepted

## Context

Due problemi emersi adottando il template su un progetto reale (ERP):

1. **Sovrascrittura dei tag standard**. Il `NamingAspect` applicava il tag
   `Name` con `resource.addPropertyOverride('Tags', [{ Key: 'Name', Value: ... }])`.
   Su CFN questa è una *override totale* dell'array `Tags`: cancella
   tutti i tag già scritti dal `TaggingAspect` (Project, Environment,
   Owner, ManagedBy, ecc.). Il sintomo è subdolo: i template
   CloudFormation generati avevano solo `Name` su VPC/Subnet/Instance/IGW
   e tutti gli altri tag spariti.

2. **Feature flag `aspectPrioritiesMutating`**. Da CDK 2.172, esiste un
   feature flag che impone alle Aspects mutanti di dichiarare una priority
   esplicita. È *off* di default su template vecchi ma *on* di default
   sui nuovi progetti generati da `cdk init`. Senza
   `{ priority: AspectPriority.MUTATING }`, il synth fallisce con
   `Cannot apply Aspect that mutates the construct tree without a priority`.

## Decision

1. Per il tag `Name`, il `NamingAspect` usa **`Tags.of(resource).add('Name', baseName)`**
   invece di `addPropertyOverride('Tags', [...])`. `Tags.of()` fa merge
   con i tag esistenti, `addPropertyOverride('Tags', ...)` li sovrascrive.

   `addPropertyOverride` resta corretto per le proprietà CFN che **non
   sono tag** (`GroupName` su SG, `BucketName` su S3, `LogGroupName`,
   `AlarmName`, `RoleName`, ecc.): non tocca i tag e va bene così.

2. Quando registriamo gli Aspects globali in `InfrastructureApp.applyGlobalAspects()`,
   passiamo **`{ priority: AspectPriority.MUTATING }`** sia per il
   `TaggingAspect` sia per il `NamingAspect`. Entrambi modificano il tree.

## Naming asymmetry — perché S3/Lambda/Role/etc. non hanno tag `Name`

Il `NamingAspect` applica il tag `Name` **solo** alle risorse *server-like*
(VPC, Subnet, EC2 Instance, IGW, SecurityGroup). Per le altre
(S3, LogGroup, Alarm, Lambda, Role, Policy, Events::Rule) imposta solo la
proprietà CFN nominale (`BucketName`, `LogGroupName`, `RoleName`, ecc.).

Non è una dimenticanza: è una scelta. Per le risorse server-like la console
AWS usa il tag `Name` come display nelle liste (la colonna "Name" della
schermata EC2 deriva dal tag — senza, vedi solo `i-xxx`). Per le altre
risorse la proprietà nominale CFN **è già** l'identificatore mostrato in
console, e aggiungere un tag `Name` duplicherebbe l'informazione creando
due fonti di verità che possono divergere (es. rinomini un alarm cambiando
`AlarmName` ma il tag `Name` resta vecchio).

I tag di tracciamento (Project, Environment, Owner, ecc.) li aggiunge
comunque il `TaggingAspect` su ogni risorsa taggable, quindi anche un
bucket S3 resta perfettamente attribuibile.

Chi rivede il `switch` in `applyNamingByResourceType` e pensa di
"uniformare" aggiungendo `Tags.of(resource).add('Name', baseName)` agli
altri case: non farlo prima di aver letto questa sezione e capito il
trade-off.

## Consequences

**Positive**:
- i tag standard del `TaggingAspect` non vengono più sovrascritti dal
  `NamingAspect`: la risorsa finale ha tutti i tag attesi;
- il template è forward-compatible con il flag `aspectPrioritiesMutating`,
  che è on-by-default sui nuovi progetti CDK;
- la regola "Tags.of() per i tag, addPropertyOverride per il resto" è
  spiegata da un commento nel `NamingAspect`, riducibile a una linea di
  review: "se aggiungi un tag tramite Aspect, usa Tags.of()".

**Negative**:
- il pattern non è più uniforme tra tag e proprietà non-tag (uno usa
  `Tags.of()`, l'altro `addPropertyOverride`). È accettabile perché
  rispecchia la differenza reale a livello CFN.
- l'asimmetria server-like vs non-server-like (vedi sopra) richiede un
  caso di consultazione in più quando si aggiunge un nuovo `case` al
  `switch`. Mitigato dal commento nel codice e da questa sezione.

## Alternatives considerate

- **Mergiare manualmente l'array Tags in `addPropertyOverride`**: in
  teoria possibile leggendo `node.tags.renderedTags`, in pratica fragile
  perché il `TaggingAspect` viene eseguito *anche dopo* il `NamingAspect`
  ed è difficile garantire l'ordine di applicazione senza rendere il codice
  ostico. `Tags.of()` delega il merge al runtime CDK.

- **Spostare tutta la logica di Name in `TaggingAspect`**: separa male le
  responsabilità (`TaggingAspect` non deve sapere come si genera il nome
  IT). Tenere i due Aspects separati e farli entrambi convergere sui tag
  via `Tags.of()` è più chiaro.

- **Lasciare priority implicita e disattivare il flag**: rinvia il
  problema ai consumer del template. Per un repo di riferimento è meglio
  dichiarare la priority esplicita una volta sola.
