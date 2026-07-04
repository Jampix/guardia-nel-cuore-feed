/**
 * Infra-DLC — Controllo C2: diff-analyzer.
 *
 * Sensor computazionale (pre-deploy) che blocca un deploy quando il diff prevede
 * REPLACE o DESTROY su risorse STATEFUL (perdita dati) o IMMUTABLE-NAME (nome fisico
 * immutable → il replace rompe Custom Resource / riferimenti). È la traduzione in
 * controllo dei gotcha #1 (NamingAspect non deterministico) e correlati.
 *
 * Progettato come logica pura + adapter di input, così il cuore è testabile offline.
 * Zero dipendenze esterne.
 */

// ---------------------------------------------------------------------------
// Modello
// ---------------------------------------------------------------------------

/** Impatto di un cambiamento su una risorsa (allineato alla semantica CloudFormation/cdk diff). */
export type ResourceImpact =
  | 'create'
  | 'update'
  | 'replace' // replacement certo ("requires replacement" / Replacement=True)
  | 'conditional-replace' // potrebbe avvenire ("may be replaced" / Replacement=Conditional)
  | 'destroy' // risorsa rimossa
  | 'no-change';

/** Categoria di pericolosità di un tipo di risorsa. */
export type ResourceCategory = 'stateful' | 'immutable-name';

/** Cambiamento normalizzato su una singola risorsa. */
export interface ResourceChange {
  logicalId: string;
  resourceType: string; // es. 'AWS::S3::Bucket'
  impact: ResourceImpact;
}

/** Violazione rilevata dal sensor. */
export interface Violation {
  logicalId: string;
  resourceType: string;
  impact: ResourceImpact;
  categories: ResourceCategory[];
  /** Messaggio scritto per l'LLM: non "errore X" ma "fai Y per ripararti". */
  selfCorrection: string;
}

export interface AnalyzerPolicy {
  statefulTypes: ReadonlySet<string>;
  immutableNameTypes: ReadonlySet<string>;
  /** Se true, anche 'conditional-replace' è una violazione (default: true). */
  blockConditional: boolean;
}

// ---------------------------------------------------------------------------
// Policy di default — liste curate (derivate da esperienza, vedi gotcha-to-sensor-map)
// ---------------------------------------------------------------------------

/** Risorse il cui REPLACE/DESTROY comporta perdita di dati. */
export const DEFAULT_STATEFUL_TYPES: ReadonlySet<string> = new Set([
  'AWS::S3::Bucket',
  'AWS::RDS::DBInstance',
  'AWS::RDS::DBCluster',
  'AWS::DynamoDB::Table',
  'AWS::DynamoDB::GlobalTable',
  'AWS::EC2::Volume',
  'AWS::EFS::FileSystem',
  'AWS::FSx::FileSystem',
  'AWS::ElastiCache::CacheCluster',
  'AWS::ElastiCache::ReplicationGroup',
  'AWS::Redshift::Cluster',
  'AWS::DocDB::DBCluster',
  'AWS::Neptune::DBCluster',
  'AWS::OpenSearchService::Domain',
  'AWS::Elasticsearch::Domain',
  'AWS::DirectoryService::MicrosoftAD',
  'AWS::DirectoryService::SimpleAD',
  'AWS::Cognito::UserPool',
  'AWS::SecretsManager::Secret',
  'AWS::Backup::BackupVault',
  'AWS::QLDB::Ledger',
  'AWS::Timestream::Table',
]);

/**
 * Risorse con nome fisico immutable: un cambio di nome ne forza il REPLACE e rompe
 * eventuali Custom Resource che le referenziano come ServiceToken. Sono le risorse
 * tipicamente nominate dal NamingAspect (gotcha #1).
 */
export const DEFAULT_IMMUTABLE_NAME_TYPES: ReadonlySet<string> = new Set([
  'AWS::S3::Bucket',
  'AWS::Lambda::Function',
  'AWS::IAM::Role',
  'AWS::IAM::ManagedPolicy',
  'AWS::IAM::Group',
  'AWS::IAM::User',
  'AWS::Logs::LogGroup',
  'AWS::CloudWatch::Alarm',
  'AWS::Events::Rule',
  'AWS::DynamoDB::Table',
  'AWS::SNS::Topic',
  'AWS::SQS::Queue',
  'AWS::ElasticLoadBalancingV2::LoadBalancer',
]);

export const DEFAULT_POLICY: AnalyzerPolicy = {
  statefulTypes: DEFAULT_STATEFUL_TYPES,
  immutableNameTypes: DEFAULT_IMMUTABLE_NAME_TYPES,
  blockConditional: true,
};

// ---------------------------------------------------------------------------
// Core: analisi (logica pura)
// ---------------------------------------------------------------------------

function isDangerous(impact: ResourceImpact, blockConditional: boolean): boolean {
  if (impact === 'replace' || impact === 'destroy') {
    return true;
  }
  if (impact === 'conditional-replace') {
    return blockConditional;
  }
  return false;
}

function buildSelfCorrection(
  logicalId: string,
  resourceType: string,
  impact: ResourceImpact,
  categories: ResourceCategory[],
): string {
  const verb = impact === 'destroy' ? 'DESTROY' : 'REPLACE';
  const parts: string[] = [
    `${verb} previsto su \`${logicalId}\` (${resourceType}). NON procedere al deploy.`,
  ];

  if (categories.includes('stateful')) {
    parts.push(
      'È una risorsa STATEFUL: il replace/destroy distrugge i dati contenuti. ' +
        'Opzioni: (a) imposta `removalPolicy: RETAIN`; (b) evita il cambio della proprietà ' +
        'immutable che forza il replace; (c) se la migrazione è voluta, esporta/reimporta i dati esplicitamente.',
    );
  }

  if (categories.includes('immutable-name')) {
    parts.push(
      'Ha un nome fisico immutable: la causa tipica è un nome rigenerato ad ogni synth ' +
        '(NamingAspect non deterministico, gotcha #1). Verifica il determinism check (C1): ' +
        'il suffix deve derivare da un hash di `node.path`, non da `uuidv4()`/`Math.random()`. ' +
        'In alternativa fissa un nome esplicito stabile.',
    );
  }

  return parts.join(' ');
}

/**
 * Cuore del sensor: data la lista normalizzata dei cambi, restituisce le violazioni.
 * Funzione pura — nessun I/O, nessuna dipendenza.
 */
export function analyzeChanges(
  changes: ResourceChange[],
  policy: AnalyzerPolicy = DEFAULT_POLICY,
): Violation[] {
  const violations: Violation[] = [];

  for (const change of changes) {
    if (!isDangerous(change.impact, policy.blockConditional)) {
      continue;
    }

    const categories: ResourceCategory[] = [];
    if (policy.statefulTypes.has(change.resourceType)) {
      categories.push('stateful');
    }
    if (policy.immutableNameTypes.has(change.resourceType)) {
      categories.push('immutable-name');
    }

    if (categories.length === 0) {
      continue; // replace/destroy su risorsa stateless e senza nome immutable → ok
    }

    violations.push({
      logicalId: change.logicalId,
      resourceType: change.resourceType,
      impact: change.impact,
      categories,
      selfCorrection: buildSelfCorrection(
        change.logicalId,
        change.resourceType,
        change.impact,
        categories,
      ),
    });
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Adapter 1 — CloudFormation change set (via descrizione, robusto)
// ---------------------------------------------------------------------------

/** Sottoinsieme tipato dell'output di `aws cloudformation describe-change-set`. */
interface ChangeSetResourceChange {
  Action?: string; // Add | Modify | Remove | Import | Dynamic
  LogicalResourceId?: string;
  ResourceType?: string;
  Replacement?: string; // True | False | Conditional
}
export interface ChangeSetDescription {
  Status?: string;
  StatusReason?: string;
  Changes?: Array<{ Type?: string; ResourceChange?: ChangeSetResourceChange }>;
}

function impactFromChangeSet(rc: ChangeSetResourceChange): ResourceImpact {
  switch (rc.Action) {
    case 'Add':
      return 'create';
    case 'Remove':
      return 'destroy';
    case 'Import':
      return 'no-change';
    case 'Modify':
    case 'Dynamic':
      if (rc.Replacement === 'True') {
        return 'replace';
      }
      if (rc.Replacement === 'Conditional') {
        return 'conditional-replace';
      }
      return 'update';
    default:
      return 'no-change';
  }
}

/** Normalizza l'output JSON di `aws cloudformation describe-change-set`. */
export function fromChangeSet(description: ChangeSetDescription): ResourceChange[] {
  const changes = description.Changes ?? [];
  const out: ResourceChange[] = [];
  for (const c of changes) {
    const rc = c.ResourceChange;
    if (!rc || !rc.LogicalResourceId || !rc.ResourceType) {
      continue;
    }
    out.push({
      logicalId: rc.LogicalResourceId,
      resourceType: rc.ResourceType,
      impact: impactFromChangeSet(rc),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Adapter 2 — testo di `cdk diff` (comodo fallback, tollerante)
// ---------------------------------------------------------------------------

const RESOURCE_LINE = /^[\s│├└─]*\[([+\-~])\]\s+(AWS::[A-Za-z0-9]+::[A-Za-z0-9]+)\s+(.+?)\s*$/;
const REQUIRES_REPLACEMENT = /requires replacement/i;
const MAY_BE_REPLACED = /may be replaced/i;

/** Estrae il logicalId dalla coda della riga risorsa (ultimo token "pulito"). */
function extractLogicalId(tail: string): string {
  // cdk stampa: "<ConstructPath> <LogicalId> [replace]"; togliamo eventuale keyword finale
  const cleaned = tail.replace(/\s+(replace|destroy|may be replaced)\s*$/i, '').trim();
  const tokens = cleaned.split(/\s+/);
  return tokens[tokens.length - 1] ?? cleaned;
}

/**
 * Parser tollerante del testo di `cdk diff`. Per ogni risorsa determina l'impatto e lo
 * "promuove" a replace se le righe-proprietà successive segnalano la sostituzione.
 *
 * NB: il formato testuale di cdk diff è meno stabile del change set: preferire `fromChangeSet`
 * dove possibile. Questo adapter è un comodo fallback.
 */
export function fromCdkDiffText(text: string): ResourceChange[] {
  const lines = text.split(/\r?\n/);
  const out: ResourceChange[] = [];
  let current: ResourceChange | undefined;

  const flush = (): void => {
    if (current) {
      out.push(current);
      current = undefined;
    }
  };

  for (const line of lines) {
    const m = RESOURCE_LINE.exec(line);
    if (m) {
      flush();
      const marker = m[1];
      const resourceType = m[2];
      const logicalId = extractLogicalId(m[3]);
      let impact: ResourceImpact = 'update';
      if (marker === '+') {
        impact = 'create';
      } else if (marker === '-') {
        impact = 'destroy';
      } else if (/\breplace\b/i.test(line)) {
        impact = 'replace';
      }
      current = { logicalId, resourceType, impact };
      continue;
    }

    // righe-proprietà sotto la risorsa corrente
    if (current && current.impact === 'update') {
      if (REQUIRES_REPLACEMENT.test(line)) {
        current.impact = 'replace';
      } else if (MAY_BE_REPLACED.test(line)) {
        current.impact = 'conditional-replace';
      }
    }
  }
  flush();
  return out;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export interface AnalysisReport {
  violations: Violation[];
  ok: boolean;
}

export function analyze(
  changes: ResourceChange[],
  policy: AnalyzerPolicy = DEFAULT_POLICY,
): AnalysisReport {
  const violations = analyzeChanges(changes, policy);
  return { violations, ok: violations.length === 0 };
}

/** Render leggibile (anche per consumo LLM) del report. */
export function formatReport(report: AnalysisReport): string {
  if (report.ok) {
    return '✅ Infra-DLC C2 diff-analyzer: nessun REPLACE/DESTROY su risorse stateful o immutable-name.';
  }
  const header = `🛑 Infra-DLC C2 diff-analyzer: ${report.violations.length} violazione/i — deploy BLOCCATO.\n`;
  const body = report.violations
    .map((v, i) => {
      const tags = v.categories.join(', ');
      return `\n[${i + 1}] ${v.impact.toUpperCase()} — ${v.logicalId} (${v.resourceType}) [${tags}]\n    ${v.selfCorrection}`;
    })
    .join('\n');
  return header + body;
}
