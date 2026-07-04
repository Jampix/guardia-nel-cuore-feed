# ADR-005 — Cross-stack: passare stringhe, non oggetti CDK

**Status**: accepted

## Context

Quando uno stack ha bisogno di una risorsa creata in un altro stack (es.
`StorageStack` ha bisogno dell'EC2 di `ComputeStack` per attaccarci un
EBS), CDK supporta due stili:

```typescript
// Stile A — passa l'oggetto CDK
new StorageStack(app, 'Storage', { instance: compute.instance });

// Stile B — passa stringhe (ID, ARN, allocation ID)
new StorageStack(app, 'Storage', {
  instanceId: compute.instance.instanceId,
  availabilityZone: compute.instance.instanceAvailabilityZone,
});
```

Lo stile A è più ergonomico: hai un riferimento tipato e puoi chiamare
metodi sull'oggetto. Ma ha un problema: ogni operazione che modifica
l'oggetto (es. `volume.grantAttachVolumeByResourceTag(instance, ...)`
modifica il role dell'instance) crea una **dipendenza inversa nascosta**:
lo stack ricevente sta scrivendo nel donatore. Se entrambi gli stack
hanno bisogno di leggere qualcosa l'uno dell'altro, si forma un ciclo.

Lo abbiamo sperimentato concretamente: passando `instance: Instance` allo
`StorageStack`, il sintetizzatore CDK falliva con:

> Adding this dependency (ComputeStack -> StorageStack/EBSVolumeConstruct/...)
> would create a cyclic reference.

## Decision

I dati che attraversano un confine di stack si passano come **stringhe**
(ID, ARN, allocation ID). Quando serve creare una relazione AWS tra
risorse di stack diversi, si usano i CFN L1 con riferimenti per ID
(`CfnVolumeAttachment` con `instanceId: string` e `volumeId: string`),
non i metodi L2 che modificano oggetti.

Le props di stack che dipendono da risorse cross-stack si dichiarano
così:

```typescript
export interface StorageStackProps extends StackProps {
  config: ProjectConfig;
  instanceId: string;          // non Instance
  availabilityZone: string;    // non subnet/AZ object
}
```

## Consequences

**Positive**:
- impossibile creare cicli accidentali tra stack;
- gli stack sono più disaccoppiati: se cambia il tipo concreto della
  risorsa nel donatore, il consumatore non si rompe finché continua a
  ricevere lo stesso tipo di stringa;
- gli stack si possono testare in isolamento passando stringhe finte.

**Negative**:
- perdi i metodi L2: per creare l'attach del volume usiamo `CfnVolumeAttachment`
  invece di `volume.attachToInstance()`;
- alcune operazioni che richiedono di modificare il role dell'istanza
  (es. logica di mount via `userData`) vanno fatte nello stack donatore,
  non nel consumatore. Vedi il mount EBS in `ec2-instance.ts` invece che
  in `storage-stack.ts`.

## Alternatives considerate

- **Passare oggetti CDK e accettare l'esistenza di cicli "innocui"**:
  rifiutato perché un ciclo "innocuo" oggi diventa bloccante domani
  appena qualcuno aggiunge un grant() in più.
- **Mettere tutto in un singolo stack** (no `StorageStack` separato):
  funziona ma perde i benefici degli stack come boundary di deploy
  (es. `removalPolicy` differenziata, deploy parziale).
- **Cross-stack reference via CDK `CfnOutput` + `Fn.importValue`**:
  è quello che CDK fa sotto il cofano quando passi oggetti. Esplicitarlo
  manualmente non aiuta: il problema è la dipendenza inversa, non lo
  stile della reference.
