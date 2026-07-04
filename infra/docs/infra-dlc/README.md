# Infra-DLC

> Quaderno di bottega dell'iniziativa **Infra-DLC**: una metodologia AI-native per i progetti
> infrastrutturali (Infrastructure-as-Code, CDK), ispirata ad AWS AI-DLC e al harness engineering, ma
> ribilanciata per l'IaC.

## North star

Dare agli agenti di coding la possibilità di lavorare con **meno supervisione** sull'infrastruttura,
costruendo la **fiducia** nei loro risultati tramite un sistema esplicito di controlli (harness).
Un repo "template" è il veicolo: definendo qui il metodo, lo si **eredita** in tutti i progetti che
ne derivano.

## La tesi in una riga

**Infra-DLC è il _metodo_, l'harness è il _motore di fiducia_ che lo esegue, e il template-cdk è la
_harness-template_ che lo propaga — il tutto giustificato dalla Legge di Ashby (committarsi a una
topologia riduce la varietà → rende l'harness completo realizzabile).**

## Perché l'infra è il terreno ideale

L'IaC ha "ambient affordances" al massimo grado (vocabolario di Böckeler):

- **TS strict** → type checker = sensor computazionale gratuito.
- **`cdk synth`** → artefatto dichiarativo deterministico su cui si può _asserire_.
- **`cdk diff`** → sensor strutturale nativo (CREATE / UPDATE / **REPLACE**).
- **aspects + validator** → guide computazionali che girano già al synth.
- La **behaviour harness** (l'"elefante" dell'app-dev) collassa in gran parte su **fitness function
  deterministiche** (cdk-nag + asserzioni custom).

## I quattro loop

| Loop | Quando | Cosa copre |
|---|---|---|
| **Bootstrap** | una volta per progetto | identità account, project code, CIDR + censimento, modello ambienti, connettività, scelta naming |
| **Increment** | per ogni fase/stack (il "bolt") | Design → Build → Rollout |
| **Propagation** | trasversale | fix scoperto in un progetto → template → progetti derivati, con tabella di stato (= lo "steering loop") |
| **Day-2** | continuo | cost, drift, verifica backup, decommission |

## Le fasi dell'Increment loop

`Design` (cosa/perché: blast radius, costo, CIDR, sicurezza) →
`Build` (config tipata + aspects + construct) →
`Rollout` (synth deterministico, cdk diff, staging-first, rollback).

## Mappa della cartella

- [`references.md`](references.md) — le fonti che abbiamo preso (Böckeler, AWS AI-DLC, awslabs/aidlc-workflows) + i takeaway distillati.
- [`decisions.md`](decisions.md) — log delle decisioni prese man mano.
- [`harness/gotcha-to-sensor-map.md`](harness/gotcha-to-sensor-map.md) — **filo #1**: i gotcha vissuti trasformati in controlli (guide/sensor).
- [`runbooks/start-a-project.md`](runbooks/start-a-project.md) — come parte un progetto con Infra-DLC (Bootstrap + primo Increment, con i gate).

## Stato

🚧 In fase di **ragionamento/design** sulla branch `feature/infra-dlc`. Nessun codice/regola
operativa ancora prodotta. Si parte dal filo #1 (mappa gotcha → sensor).
