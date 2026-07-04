# Infra-DLC — Log delle decisioni

Decisioni prese man mano durante il design dell'iniziativa. Append-only; ogni voce datata.

---

## 2026-06-18

- **D1 — Facciamo Infra-DLC, ambizioso.** Non un semplice "come aggiungo una Phase", ma il **metodo
  generale** del template per i progetti infra (i 4 loop: Bootstrap / Increment / Propagation / Day-2).
- **D2 — Vive nel repo template, su branch.** Niente repo separata (romperebbe la propagazione ereditaria).
  Branch di lavoro: `feature/infra-dlc`. Eventuale estrazione in repo dedicata SOLO se mai servisse
  distribuzione indipendente à la awslabs/aidlc-workflows (decisione rimandata).
- **D3 — "La parte AI" = harness engineering.** Adottiamo il vocabolario di Böckeler (guide/sensor,
  computazionale/inferenziale, keep-quality-left, steering loop, Ashby) come strato di esecuzione dei gate.
- **D4 — Principio anti-shelfware (regola d'oro).** Ogni elemento di Infra-DLC deve mappare su qualcosa
  che **facciamo già** o su un **dolore già sentito**. Se non corrisponde a esperienza vissuta, si taglia.
  Ambizioso nella copertura, spietato nell'encodare solo lived experience.
- **D5 — I gotcha sono la spec dell'harness.** I gotcha noti del template e dei progetti derivati non sono
  documentazione: ogni voce è la **prova di un controllo mancante**. Punto di partenza operativo = filo #1
  (mappa gotcha → sensor).
- **D6 — Cartella `docs/infra-dlc/`** come quaderno di bottega: vi mettiamo dentro le fonti prese e le
  decisioni man mano.

### Pending / da decidere

- Forma finale degli artefatti operativi (ADR + `CLAUDE.md` + skill) e come si dispongono per ereditarsi.
- Fitness function di sicurezza/architettura (cdk-nag rules + asserzioni custom) — filo #2.
- Schema definitivo della mappa gotcha → sensor (in revisione, vedi `harness/gotcha-to-sensor-map.md`).
