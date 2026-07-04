# §III — Un modello a due assi per l'IaaC

> Bozza in italiano (da tradurre in inglese in fase finale). Ancorata al repo `template-cdk`.

Una metodologia template-based deve rispondere a due domande indipendenti: *con quale granularità si compone l'infrastruttura* (granularità) e *quali esigenze funzionali ogni deployment deve coprire* (copertura). Sosteniamo che siano **due assi ortogonali**, e che confonderli sia la causa profonda della scarsa riusabilità che si osserva nella pratica IaC. La nostra metodologia organizza quindi qualsiasi artefatto Infrastructure-as-Code lungo un **asse verticale di livelli di composizione** e un **asse orizzontale di pillar funzionali**.

## A. Asse verticale — i Livelli di composizione

Dal più fine al più grossolano, ogni livello *compone* quello sottostante ed espone all'alto un'interfaccia più stretta e più dichiarativa:

1. **Risorsa** — la primitiva nativa del provider (es. un'istanza EC2, una VPC, un bucket S3). È l'unico livello intrinsecamente legato al provider, ed è l'unico che il *motore* IaC (CloudFormation, ARM, Deployment Manager) istanzia direttamente.

2. **Costrutto** — un'astrazione di codice che incapsula una o più risorse insieme alle best practice che richiedono (cifratura di default, ruoli a privilegio minimo, default sensati). Il costrutto è l'unità di *riuso*: nell'implementazione di riferimento, `lib/constructs/networking/vpc.ts` o `compute/ec2-instance.ts` racchiudono ciascuno una porzione coerente di risorse dietro un'interfaccia tipizzata.

3. **Stack** — un gruppo deployabile di costrutti che forma un'unità di ciclo di vita e un confine di fallimento e rollback. Gli stack dichiarano le proprie dipendenze in modo *esplicito* (es. `ComputeStack` dipende da `NetworkStack`), il che rende il deployment un grafo aciclico diretto invece che un ordinamento implicito. Lo stack è l'unità di *deployment*.

4. **SuperTemplate** — l'assemblaggio riusabile e parametrizzato di costrutti, stack, configurazione, validazione e policy trasversali che si clona per avviare un nuovo progetto. È un *template di template*: non descrive una singola infrastruttura ma una *famiglia* di infrastrutture, selezionata dalla configurazione. Il suo motore di composizione (`InfrastructureApp`) decide quali stack esistono, sotto quali feature flag, e con quali dipendenze. Il SuperTemplate è l'unità di *standardizzazione* tra progetti diversi.

5. **App** — un'istanza concreta del SuperTemplate vincolata a una singola tupla ⟨progetto, environment, account, region⟩ (es. *dev*, *staging*, *prod*). L'App è l'unità di *delivery*: lo stesso SuperTemplate produce un'App per ciascun environment, ognuna diversa solo per configurazione, mai per codice.

La tesi metodologica è che **la standardizzazione vive a livello SuperTemplate, mentre la variazione è spinta interamente nella configurazione a livello App**. Il codice si scrive una volta (Costrutto/Stack), si assembla una volta (SuperTemplate) e si istanzia *N* volte (App) con zero divergenza di codice tra environment — la proprietà che permette all'approccio di scalare a molti progetti e account senza fork.

## B. Asse orizzontale — i Pillar funzionali

Ortogonali ai livelli, ogni deployment non banale deve affrontare un insieme ricorrente di **pillar funzionali** — esigenze che esistono in *ogni* provider cloud, anche se le risorse che le realizzano differiscono. Li ordiniamo secondo la loro dipendenza naturale, dalla fondazione al trasversale:

- **DNS & Naming** — indirizzabilità e uno schema di naming deterministico e privo di collisioni.
- **Networking** — VPC/VNet, subnet, routing, security group: il substrato di connettività.
- **Sicurezza & Certificati** — identità (ruoli a privilegio minimo), materiale TLS, segreti.
- **Compute & Storage** — le risorse che ospitano il carico di lavoro.
- **Monitoring** — metriche, allarmi, dashboard.
- **Observability** — log, tracce, policy di retention.
- **Cost** — budget, tag di allocazione costi, ottimizzazione (es. spegnimento programmato).

Un pillar è un *concetto*, non una risorsa: il pillar *Monitoring* è CloudWatch su AWS, Azure Monitor su Azure, Cloud Monitoring su GCP, ma l'obbligo metodologico — "ogni App dichiara la propria postura di monitoring" — è invariante. Nell'implementazione di riferimento ogni pillar si materializza come uno o più stack/costrutti (es. *Networking* → `NetworkStack`, *Cost* → `CostOptimizationStack`), molti dei quali attivabili per-environment tramite feature flag.

## C. Indipendenza dal provider (RQ1)

Il modello a due assi risponde direttamente alla domanda se la metodologia sia indipendente da AWS. **Solo il livello Risorsa e il motore IaC sono legati al provider; ogni livello sopra la Risorsa e ogni pillar è astratto.** Una migrazione verso un altro provider re-implementa le *foglie* (le risorse) e sostituisce il *motore*, mentre i livelli (Costrutto→Stack→SuperTemplate→App) e i pillar (DNS→…→Cost) si conservano invariati.

La Tabella I rende esplicito il mapping tra i tre principali provider; la stessa griglia livelli×pillar è poi realizzata da due motori — una variante **CDK-oriented** (imperativa, il nostro riferimento) e una **Terraform-oriented** (moduli HCL dichiarativi) — dimostrando che la metodologia è anche indipendente dal *motore*, non solo portabile tra cloud.

> *[Tabella I — la tabella del prof: Risorsa base / Template / Motore IaC / Gruppo di risorse=Stack / Astrazione codice / Livello top=App per AWS·Azure·GCP]*
>
> *[Figura 1 — matrice Livelli × Pillar: righe = i 5 livelli, colonne = i 7 pillar; ogni cella mostra l'artefatto del repo (es. cella Stack×Networking = NetworkStack). Celle "motore/risorsa" evidenziate = provider-specific; tutto il resto = agnostico.]*
