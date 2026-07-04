# Architecture Decision Records

Le decisioni architetturali del template, con il loro **perché**.

Formato: ogni ADR ha quattro sezioni — Context, Decision, Consequences,
Alternatives considerate. Quando la realtà cambia, una ADR può essere marcata
come *superseded* da una più recente; non si edita la decisione vecchia.

## Indice

- [001 - Orchestrator class per la composizione degli stack](001-orchestrator-class.md)
- [002 - Feature flag dichiarate nella config](002-feature-flags-in-config.md)
- [003 - SSM Session Manager invece di SSH](003-ssm-instead-of-ssh.md)
- [004 - Naming e tagging via Aspects globali](004-aspects-for-naming-tagging.md)
- [005 - Cross-stack: passare stringhe, non oggetti CDK](005-cross-stack-strings-not-objects.md)
- [006 - Tag Name via Tags.of(), priority Aspects esplicita](006-tags-of-vs-property-override.md)

## Quando aggiungere un ADR

Quando una scelta architetturale:
- ha alternative ragionevoli che sono state scartate;
- ha conseguenze non ovvie sulla manutenibilità o sulla sicurezza;
- è probabile che venga rimessa in discussione tra 6 mesi.

Non servono ADR per micro-decisioni (naming di una variabile, ordine di import).
