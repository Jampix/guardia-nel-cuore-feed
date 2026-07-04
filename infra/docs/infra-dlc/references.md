# Infra-DLC — Riferimenti

Fonti esterne su cui poggia l'iniziativa, con i takeaway distillati (link alla fonte, non copia integrale).

---

## 1. Harness Engineering — Birgitta Böckeler (Thoughtworks / martinfowler.com)

- **URL**: https://martinfowler.com/articles/harness-engineering.html
- **Data**: 02 aprile 2026
- **Ruolo nel nostro framework**: è **"la parte AI"** di Infra-DLC. Dà il vocabolario rigoroso per
  imbrigliare l'agente e fidarsi del risultato.

### Concetti chiave

- **Agent = Model + Harness** — l'harness è "tutto nell'agente tranne il modello". Esiste un harness
  _builder_ (interno all'agente) e un harness _user_ (quello che costruiamo noi per il nostro caso).
- **Guides (feedforward)** — anticipano e steerano l'agente _prima_ che agisca; alzano la probabilità
  di azzeccarlo al primo colpo.
- **Sensors (feedback)** — osservano _dopo_ l'azione e abilitano l'auto-correzione. Potentissimi quando
  emettono **segnali ottimizzati per il consumo dell'LLM** (messaggio del linter che _include l'istruzione_
  per correggersi — "a positive kind of prompt injection").
- **Computazionale vs Inferenziale**:
  - _Computazionale_ — deterministico, veloce, affidabile (test, linter, type checker, analisi strutturale).
    Gira su ogni change.
  - _Inferenziale_ — analisi semantica, AI review, "LLM-as-judge". Lento, costoso, non deterministico.
    Selettivo.
- **Steering loop** — quando un problema si ripete, si migliora il controllo (guide/sensor) per renderlo
  meno probabile o impossibile. _È il nostro Propagation loop._
- **Keep quality left** — distribuire i controlli nel lifecycle per costo/velocità/criticità: cheap a
  sinistra (pre-commit), expensive a destra (post-integrazione).
- **Tre categorie di regolazione**: _Maintainability_ (qualità interna del codice) · _Architecture
  fitness_ (fitness function sulle caratteristiche architetturali) · _Behaviour_ (correttezza funzionale —
  la più difficile).
- **Harnessability / ambient affordances** — proprietà strutturali che rendono l'ambiente "legibile,
  navigabile, trattabile" per l'agente (tipizzazione, confini di modulo, framework).
- **Harness templates** — bundle di guide+sensor per una topologia ricorrente. _Stato evolutivo futuro
  del template-cdk._
- **Legge di Ashby (Requisite Variety)** — "un regolatore deve avere almeno tanta varietà quanto il
  sistema che governa, e può regolare solo ciò di cui ha un modello". Committarsi a una topologia è una
  **mossa di riduzione della varietà** → rende l'harness completo realizzabile. _Giustificazione teorica
  del template-cdk._
- **Ruolo dell'umano** — l'harness non punta a eliminare l'input umano, ma a **dirigerlo dove conta di
  più** (correttezza, misdiagnosi, allineamento organizzativo).

---

## 2. AWS AI-DLC — AI-Driven Development Life Cycle

- **Blog originale**: https://aws.amazon.com/blogs/devops/ai-driven-development-life-cycle/
- **Open-sourcing degli adaptive workflows** (29 nov 2025):
  https://aws.amazon.com/blogs/devops/open-sourcing-adaptive-workflows-for-ai-driven-development-life-cycle-ai-dlc/
- **re:Invent 2025 (DVT214)**: https://dev.to/kazuya_dev/aws-reinvent-2025-introducing-ai-driven-development-lifecycle-ai-dlc-dvt214-32b
- **Ruolo nel nostro framework**: è lo **spunto metodologico**. Lo adottiamo come ispirazione, NON pari
  pari — lo ribilanciamo per l'infra (vedi README).

### Concetti chiave

- **AI Powered Execution with Human Oversight** — l'AI esegue e propone piani, fa domande di chiarimento,
  rimanda le decisioni critiche all'umano.
- **Tre fasi**: _Inception_ (cosa/perché, rito "Mob Elaboration") → _Construction_ (come, "Mob
  Construction") → _Operations_ (deploy/IaC, indicata come fase futura nel repo).
- **Terminologia**: _Bolts_ (sostituiscono gli sprint, ore/giorni) · _Units of Work_ (sostituiscono gli Epic).
- **Nostra critica/adattamento**: AI-DLC mette Operations in fondo; nell'infra Operations è il **cuore e
  la superficie di rischio**. Quindi ribilanciamo (vedi i 4 loop nel README).

---

## 3. awslabs/aidlc-workflows

- **URL**: https://github.com/awslabs/aidlc-workflows
- **Licenza**: MIT-0
- **Cosa è**: "adaptive workflow steering rules for AI coding agents" — scaffold che valutano contesto e
  complessità e costruiscono dinamicamente il percorso, con gate human-in-the-loop.
- **Rilevanza**: **supporta Claude Code (CLI)** (oltre a Kiro, Amazon Q, Cursor, Cline, Copilot, Codex).
  I file vanno in `CLAUDE.md` / dir dell'agente; artefatti generati in `aidlc-docs/`; si avvia con
  "Using AI-DLC, ...".
- **Tool collegati**: _AIDLC Evaluator_ (testing dei workflow) · _AIDLC Design Reviewer_ (review di design
  AI-powered, sperimentale, richiede Bedrock) → candidato come **sensor inferenziale** nel nostro Rollout.
- **Uso previsto da parte nostra**: fonte di pattern da cui distillare, NON dipendenza da adottare in
  blocco. Da valutare un pilot su un progetto greenfield futuro prima di propagare.
