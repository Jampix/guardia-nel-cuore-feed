# ADR-002 — Feature flag dichiarate nella config

**Status**: accepted

## Context

Alcuni stack (monitoring, backup, dns, scheduler, cost-optimization) non sono
sempre necessari: in dev può non servire il backup, in prod può non servire
lo scheduler di start/stop, ecc. Serve un meccanismo per
attivarli/disattivarli per environment senza commentare codice.

## Decision

Le feature attivabili sono dichiarate in `config.features`:

```typescript
features: {
  monitoring?: { enabled: boolean; logRetention: Duration; alarms: boolean };
  backup?: { enabled: boolean; retentionDays: number; schedule: string };
  dns?: { enabled: boolean; domain: string };
  scheduler?: { enabled: boolean; autoShutdown: boolean };
}
```

Tutto il controllo `if (config.features.X?.enabled)` vive in
`InfrastructureApp.compose()` in `lib/app.ts`. Gli stack non sanno di
essere "feature-flagged": ricevono i loro props e si istanziano normalmente.

Le feature sono **fail-closed**: se la config non specifica una feature, è
considerata disattivata.

## Consequences

**Positive**:
- attivare/disattivare uno stack è un cambio di config, non di codice;
- la lista delle feature attive di un environment si legge in `environments/<env>.ts`;
- il summary di deploy può elencare le feature attive coerentemente;
- la config è un contratto: `tsc` segnala se hai dimenticato di dichiarare
  una feature in un environment.

**Negative**:
- aggiungere una nuova feature richiede di toccare 4 file: `interfaces.ts`,
  `environments/{dev,staging,prod}.ts`, `lib/app.ts`. È documentato in
  `CONVENTIONS.md` §9.
- TypeScript non può forzare che le feature dichiarate in `interfaces.ts`
  siano gestite in `compose()`: serve disciplina.

## Alternatives considerate

- **Stack sempre creati con corpo vuoto se disabled**: rifiutato perché
  produce stack CloudFormation vuoti deployati e fatturati.
- **CDK context (`-c feature:foo=true`)**: rifiutato perché sposta la
  configurazione fuori dal codice e rende difficile capire lo stato per env
  guardando il repo.
- **Variabili d'ambiente al posto della config**: più volatili, meno
  type-safe. Solo `BUDGET_EMAIL` rimane in env perché è un dato sensibile
  che non vogliamo committare.
