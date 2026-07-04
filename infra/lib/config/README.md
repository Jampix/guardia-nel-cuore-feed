# `lib/config/`

Tipi, dati e validazione delle config di progetto. Tre file per tre
responsabilità diverse.

| File | Responsabilità | Quando toccarlo |
|---|---|---|
| `interfaces.ts` | Definizione dei tipi (`ProjectConfig`, `EnvironmentConfig`, `CommonConfig`) | aggiungi/modifichi un campo della config |
| `accounts.ts` | Mappa env → AWS account/region | nuovo environment, account ID reale |
| `common.ts` | Valori condivisi tra tutti gli env (projectName, projectCode, owner) | personalizzazione iniziale del template |
| `environments/<env>.ts` | Config completa per un environment | tuning per env (instance type, feature flag, ecc.) |
| `validator.ts` | `ConfigValidator.validate()` — controlli pre-deploy | aggiungi un nuovo controllo |
| `index.ts` | Barrel + `loadConfig(env)` | (raramente) nuovo environment in `loadConfig` |

Chi consuma le config importa **sempre da `lib/config`**, mai dai file
interni:

```typescript
// ✅ corretto
import { loadConfig, ProjectConfig, ConfigValidator } from '../lib/config';

// ❌ no — bypassa il barrel, rende fragili i refactor
import { loadConfig } from '../lib/config/index';
import { ProjectConfig } from '../lib/config/interfaces';
```

## Aggiungere un environment

1. `accounts.ts` → aggiungi la coppia `account`+`region`.
2. `environments/<nome>.ts` → crea la `ProjectConfig` completa (parti
   copiando `dev.ts` o `prod.ts`).
3. `index.ts` → aggiungi il `case '<nome>'` in `loadConfig()`.

## Aggiungere un campo alla config

1. `interfaces.ts` → aggiungi il campo (con doc-comment).
2. Aggiorna tutti gli `environments/<env>.ts` per includerlo.
3. (Opzionale) aggiungi un controllo in `validator.ts`.
