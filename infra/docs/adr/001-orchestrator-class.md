# ADR-001 — Orchestrator class per la composizione degli stack

**Status**: accepted

## Context

`bin/app.ts` deve istanziare gli stack del progetto, applicare gli Aspects
globali, gestire le dipendenze tra stack e attivare/disattivare gruppi di
risorse via feature flag.

Nella prima versione del template, tutta questa logica viveva inline in
`bin/app.ts`: ~230 righe di `if/else`, costruzione di nomi stack ripetuta,
`charAt(0).toUpperCase()` chiamato 8 volte, validazione config mescolata alla
composizione. Difficile leggere, difficile testare, difficile aggiungere uno
stack senza rompere qualcosa.

## Decision

Introduciamo `InfrastructureApp` in `lib/app.ts`: una classe che incapsula
tutta la logica di composizione. Il costruttore esegue, in ordine fisso:

1. `assertConfigValid()` — esegue il `ConfigValidator`, abortisce se invalida
2. `applyGlobalAspects()` — applica `TaggingAspect` e `NamingAspect`
3. `compose()` — istanzia gli stack uno per uno, con feature flag e dipendenze esplicite

`bin/app.ts` rimane un entry point minimale (~18 righe): carica la config,
istanzia `InfrastructureApp`, stampa il summary.

## Consequences

**Positive**:
- aggiungere uno stack = aggiungere un blocco in `compose()` (un solo posto
  da toccare);
- la logica di composizione è testabile in isolamento;
- chi legge il template parte da `lib/app.ts` per capire l'architettura, non
  da uno script con `if` annidati;
- il summary di deploy è coerente perché generato da un metodo unico.

**Negative**:
- chi conosce CDK ma non conosce questo template deve leggere `app.ts` prima
  di toccare uno stack — è un layer di indirezione in più;
- ogni stack riceve `env` esplicito dal `stackPrefix`, c'è del boilerplate
  ripetuto.

## Alternatives considerate

- **Tutto in `bin/app.ts`** (versione precedente): rifiutato perché non scala
  oltre 4-5 stack e mescola responsabilità.

- **Stack registry dichiarativo** (array di `{ factory, dependsOn, enabled }`):
  più astratto ma meno didattico. Per un template di riferimento la classe è
  più leggibile e onesta — non nasconde il flusso dietro un'iterazione
  generica. Da considerare se in futuro gli stack diventano molti (>15).

- **Plugin pattern** (un file per stack auto-registrato): troppa magia per
  un team che parte da CDK base.
