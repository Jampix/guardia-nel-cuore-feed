# §II — Lavori correlati e posizionamento (Domanda 2)

> Bozza in italiano (da tradurre in inglese). Risponde all'action point: *"ci sono altre
> metodologie o approcci simili e qual è il valore aggiunto del tuo?"*. Le citazioni `[n]`
> rimandano alla tabella di letteratura fornita (vedi fondo file).

La letteratura su Infrastructure-as-Code è ampia ma si concentra, quasi senza eccezioni, sull'IaC come *oggetto da osservare* — da catalogare, misurare, analizzare o generare — più che come *pratica da prescrivere*. Raggruppiamo i lavori esistenti in quattro filoni e mostriamo, per ciascuno, la domanda che lascia aperta e che la nostra metodologia affronta.

## A. I quattro filoni esistenti

**1) Mappatura e visione (descrittivo).** Gli studi di mappatura sistematica [1] e i contributi di visione [6] inquadrano *cosa* sia l'IaC e *quali* benefici prometta (scalabilità, agilità, automazione), identificando le aree di ricerca attive. Sono descrittivi: dicono che l'IaC scala, non *come* strutturarlo perché scali.

**2) Qualità, sicurezza e difetti (analitico).** Un filone consistente studia l'IaC come artefatto da analizzare a posteriori: survey di analisi statica [3], studi empirici sui difetti [7], rilevamento di *smell* e misconfigurazioni di sicurezza. Questi lavori *misurano* i problemi (chiavi hardcoded, porte aperte, tag mancanti, idempotenza violata) e propongono *detector*. Operano però *dopo* che il codice è stato scritto: classificano i difetti, non offrono un modello di composizione che li renda impossibili per costruzione.

**3) IaC nelle pipeline DevOps (di processo).** Un terzo filone descrive *come usare* gli strumenti IaC dentro CI/CD e GitOps [4] e come abilitino automazione e lifecycle in cloud ibridi [5]. Qui l'IaC è un *ingrediente del processo*: l'attenzione è sull'orchestrazione di deploy, non sull'organizzazione interna del codice di infrastruttura riusabile tra progetti.

**4) AI/LLM per l'IaC (generativo).** Il filone più recente applica AI e LLM alla generazione, completamento e riparazione di codice IaC [2]. L'AI produce o corregge artefatti; resta aperto il problema di *quale struttura* dare all'output perché sia rivedibile, sicuro e conforme a uno standard di team.

## B. La lacuna

Nessuno dei quattro filoni offre una **metodologia prescrittiva, provider-agnostica e a livelli** per *organizzare* il codice di infrastruttura riusabile. La letteratura descrive (filone 1), misura (filone 2), inserisce in pipeline (filone 3) o genera (filone 4) l'IaC — ma dà per scontato l'artefatto da analizzare. Il nostro contributo si colloca a monte: definisce *come* strutturare quell'artefatto.

## C. Il valore aggiunto

Articoliamo la differenza in quattro punti, ciascuno ancorato all'implementazione di riferimento e alle sue decisioni architetturali documentate (ADR).

**(VA1) Dalla rilevazione alla prevenzione-per-costruzione.** Dove il filone qualità/sicurezza [3], [7] *rileva* misconfigurazioni dopo la stesura, la nostra metodologia le rende *strutturalmente impossibili*. Esempi concreti:
- naming e tagging non sono responsabilità del singolo sviluppatore ma *Aspect globali* applicati all'intero tree (ADR-004): è impossibile dimenticare un tag o un nome, perché nessuno li scrive a mano;
- l'accesso interattivo passa per SSM Session Manager, non SSH: nessuna porta 22 aperta e nessuna chiave PEM da custodire, *per default* su tutti gli environment (ADR-003) — un'intera classe di smell di sicurezza non può esistere;
- i confini tra stack si attraversano con stringhe (ID/ARN), non con oggetti, eliminando per costruzione i riferimenti ciclici (ADR-005).
Lo *shift-left* qui non è uno strumento di analisi in pipeline, ma il modello di composizione stesso.

**(VA2) Standardizzazione al SuperTemplate, variazione solo in configurazione.** A differenza dei moduli riusabili "piatti" (un modulo Terraform, un construct library), la metodologia separa esplicitamente il livello di *standardizzazione* (SuperTemplate) dal livello di *istanza* (App): il codice si scrive una volta e si istanzia *N* volte senza divergenza, con le feature opzionali dichiarate in configurazione e *fail-closed* (ADR-002). È questa proprietà — non il semplice riuso di moduli — che dà la risposta operativa al "come scalare" che i lavori di visione [5], [6] lasciano sul piano concettuale.

**(VA3) Indipendenza dal provider e dal motore, formalizzata.** Il modello a due assi (livelli × pillar, §III) isola ciò che è provider-specifico (la sola foglia *Risorsa* e il motore IaC) da ciò che è invariante (livelli e pillar). Ne deriva una doppia istanziazione — CDK-oriented e Terraform-oriented — della *stessa* metodologia. La portabilità non è un'affermazione ma una conseguenza strutturale del modello.

**(VA4) GenAI come assistente dentro una struttura, non generazione libera.** Mentre il filone AI-for-IaC [2] applica LLM alla generazione free-form, noi integriamo la GenAI (Kiro) *all'interno* della metodologia: i livelli (costrutto/stack/pillar) e gli ADR forniscono al modello un bersaglio vincolato e rivedibile. La struttura riduce lo spazio di output dell'LLM a contributi conformi allo standard di team — affrontando proprio il problema di rivedibilità e conformità che la generazione libera lascia aperto.

## D. Sintesi del posizionamento

| Filone | Cosa offre | Cosa lascia aperto | Come lo affrontiamo |
|---|---|---|---|
| Mappatura/visione [1],[6] | *cosa* è l'IaC, benefici di scala | *come* strutturarlo per scalare | modello a livelli × pillar (§III) |
| Qualità/difetti [3],[7] | rilevazione post-hoc di smell | prevenzione per costruzione | Aspect, SSM-default, stringhe cross-stack (VA1) |
| IaC in CI/CD [4],[5] | uso in pipeline DevOps | organizzazione del codice riusabile | SuperTemplate vs App (VA2) |
| AI/LLM per IaC [2] | generazione/riparazione | struttura rivedibile e conforme | GenAI vincolata dalla metodologia (VA4) |

---

## Riferimenti (dalla tabella del prof — da formattare in stile IEEE)

- [1] *A Systematic Mapping Study of Infrastructure as Code Research* — Systematic Mapping. https://doi.org/10.1016/j.jss.2018.10.044
- [2] *Artificial Intelligence for Infrastructure-as-Code: A Systematic Literature Review* — Systematic Review. https://www.mdpi.com/2079-9292/15/4/755
- [3] *Static Analysis of Infrastructure as Code: A Survey* — Survey. https://arxiv.org/abs/2206.10344
- [4] *How IaC Tools Can Be Used in CI/CD Pipelines* — Empirical/Applied. https://aijcst.org/index.php/aijcst/article/view/95
- [5] *Implementing IaC for Scalable DevOps Automation in Hybrid Cloud* — Applied Research. https://doi.org/10.13140/RG.2.2.12345.67890
- [6] *Infrastructure as Code: Achieving Scalability and Agility in IT Operations* — Conceptual/Applied. https://ephijse.com/index.php/SE/article/view/240
- [7] *Bugs in Infrastructure as Code* — Empirical Study.

> Nota: il link [5] (RG.2.2.12345.67890) sembra un DOI segnaposto — da verificare prima della
> submission. Verificare anche dettagli bibliografici completi (autori, anno, venue) di tutti i [n].
