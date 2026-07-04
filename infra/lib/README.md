# `lib/`

Codice del template. Tre layer + due moduli trasversali.

| Cartella | Cosa contiene | Quando aggiungere file |
|---|---|---|
| `app.ts` | `InfrastructureApp`: orchestratore degli stack | mai (è il punto unico) |
| `stacks/` | Stack CloudFormation | quando serve un boundary di deploy |
| `constructs/` | Unità di riuso (L2 custom) raggruppate per dominio | quando hai un gruppo di risorse coeso e riusabile |
| `aspects/` | Cross-cutting concerns (naming, tagging) | raramente, solo per regole globali |
| `config/` | Tipi, dati per env, validazione | quando estendi la config |

**Regola d'oro**: niente risorse AWS dirette in `app.ts` o in `stacks/`. Tutta
l'istanziazione passa dai construct.

Per le convenzioni complete vedi `../CONVENTIONS.md`.
