# Outline — "Towards a template-based methodology for IaaC: the XXX use case"

> IEEE ScalCom 2026 — full paper, 6 pagine (template IEEE due colonne, +2 a pagamento).
> Deadline: **15 giugno 2026**. Lingua finale: inglese (bozze in italiano in questa cartella).
>
> Legenda proprietario: **[P]** = autore · **[Prof]** = relatore · **[S]** = condiviso.
> Legenda stato: ✅ bozza pronta · 🟡 da scrivere · ⬜ da definire con il prof.

## Filo conduttore — Research Questions

Da fissare in Introduzione e richiamare in ogni sezione (danno struttura "scientifica" al paper):

- **RQ1 — Indipendenza.** Una metodologia template-based per l'IaaC può essere indipendente dal *provider* e dal *motore* IaC? → risposta in §III-C (modello a due assi) + §V (doppia istanziazione CDK / Terraform).
- **RQ2 — Prevenzione per costruzione.** Quali classi di misconfigurazione l'organizzazione a livelli rende *strutturalmente impossibili*, invece di rilevarle a posteriori? → §II (VA1) + §IV (Aspect, SSM, stringhe cross-stack).
- **RQ3 — Scalabilità.** Come scala l'approccio al crescere di stack, environment/account e progetti? → §IV-E.
- **RQ4 — GenAI assistita.** La GenAI (Kiro) può assistere l'autoring restando vincolata a uno standard rivedibile e conforme? → §VI.

## Struttura e budget pagine

| # | Sezione | Owner | Stato | Pag. | Contenuto chiave |
|---|---|---|---|---|---|
| — | **Abstract** | [S] | 🟡 | 0.15 | problema, tesi (metodologia a 2 assi), caso studio AWS, claim di indipendenza/scalabilità |
| I | **Introduction** | [Prof] | 🟡 | 0.75 | intro all'IaaC; problema (riuso/divergenza/misconfig); le 4 RQ; lista contributi; struttura del paper |
| II | **Related Work & Positioning** | [P] | ✅ | 1.0 | 4 filoni (mappatura, qualità/difetti, CI/CD, AI); la lacuna; VA1–VA4; tabella di sintesi → `02-domanda2-valore-aggiunto.md` |
| III | **A Two-Axis Template Model** | [P] | ✅ | 1.25 | livelli (Risorsa→Costrutto→Stack→SuperTemplate→App) × pillar; indipendenza (RQ1); Tab. I mapping AWS/Azure/GCP; Fig. 1 matrice → `01-livelli-e-pillar.md` |
| IV | **Module Organization (Reference Impl.)** | [P] | ✅ | 1.25 | i 4 livelli nel codice + invarianti + ADR; perché scala (RQ3); Fig. 2 diagramma composizione → `03-organizzazione-moduli.md` |
| V | **Case Study: AWS + ad-hoc application** | [Prof]/[S] | ⬜ | 0.75 | applicazione ispirata a caso reale; quali pillar/feature attivati; doppia versione CDK ↔ Terraform per RQ1 |
| VI | **GenAI Integration (Kiro)** | [Prof]/[S] | ⬜ | 0.5 | Kiro come assistente vincolato dalla struttura (RQ4); esempio di flusso/prompt; conformità rivedibile |
| VII | **Discussion / Evaluation** | [S] | 🟡 | 0.5 | evidenze su RQ1–RQ4; metriche possibili (vedi sotto); confronto qualitativo con moduli "piatti" |
| VIII | **Threats to Validity / Limitations** | [S] | 🟡 | 0.25 | caso studio singolo; valutazione qualitativa; Terraform-variant come proof-of-concept |
| IX | **Conclusions & Future Work** | [Prof] | 🟡 | 0.35 | sintesi contributi; estensione multi-cloud; valutazione empirica futura |
| — | **References** | [S] | 🟡 | — | [1]–[7] del prof + CDK/Terraform/AWS docs + eventuali integrazioni |

Totale stimato ≈ 6.0 pag. (le sezioni [P] occupano ~3.5 pag: il cuore metodologico è tuo).

## Bozza di Abstract (it → da tradurre)

> L'Infrastructure-as-Code ha reso il provisioning del cloud ripetibile, ma la pratica resta
> frammentata: codice duplicato tra progetti, divergenza tra ambienti e misconfigurazioni
> ricorrenti. Proponiamo una **metodologia template-based** che organizza l'IaaC lungo due assi
> ortogonali — *livelli di composizione* (Risorsa, Costrutto, Stack, SuperTemplate, App) e
> *pillar funzionali* provider-agnostici (DNS, rete, sicurezza, monitoring, observability, costi).
> Il principio guida è concentrare la **standardizzazione** nel SuperTemplate e confinare la
> **variazione** alla sola configurazione a livello App, ottenendo riuso senza divergenza.
> Mostriamo che livelli e pillar sono indipendenti da provider e motore istanziando la stessa
> metodologia in CDK e Terraform, e la validiamo con un caso di studio su AWS ispirato a
> un'applicazione reale, con integrazione di GenAI (Kiro) come assistente vincolato alla struttura.
> La metodologia previene *per costruzione* intere classi di misconfigurazione e scala in numero
> di stack, ambienti e progetti.

## Possibili metriche per §VII (per irrobustire la valutazione)

Anche se la valutazione sarà in larga parte qualitativa, qualche numero rafforza molto il paper:

- **Divergenza di codice tra ambienti**: righe di codice condivise vs duplicate (atteso: ~0 duplicazione, solo config diversa).
- **Copertura governance**: % risorse con tag/naming conformi (atteso: 100% via Aspect, vs campione manuale).
- **Superficie d'attacco**: n. porte inbound aperte di default (atteso: 0, SSM vs SSH — ADR-003).
- **Effort di onboarding**: passi/file per aggiungere un nuovo environment (3 passi dichiarativi) o un nuovo progetto (clone + config).
- **Effort multi-cloud**: % di livelli/pillar invariati nel passaggio CDK→Terraform (atteso: tutto tranne foglia Risorsa + motore).

## TODO / questioni aperte

- ⬜ **Titolo**: sostituire "XXX" con il nome del caso d'uso reale.
- ⬜ **[5] DOI segnaposto** (`RG.2.2.12345.67890`) — verificare prima della submission.
- ⬜ **Kiro/§VI**: nel repo non c'è ancora integrazione GenAI; serve almeno un esempio concreto.
- ⬜ **Terraform-variant (§V/RQ1)**: decidere se proof-of-concept reale o mapping concettuale.
- ⬜ Confermare con il prof la divisione delle sezioni [Prof]/[S] e chi scrive Intro/Conclusioni.
