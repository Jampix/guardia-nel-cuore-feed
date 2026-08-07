import { Duration } from 'aws-cdk-lib';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface NodeFunctionConstructProps {
  /** Path al file handler TypeScript (in /backend). */
  entry: string;
  /** Variabili d'ambiente della funzione. */
  environment?: Record<string, string>;
  /** Descrizione della funzione. */
  description?: string;
  /** Scadenza dei log, se serve derogare al default del progetto. */
  logRetention?: RetentionDays;
}

/**
 * Scadenza dei log CloudWatch: **90 giorni**.
 *
 * Il default di Lambda è "mai", e infatti tutti i log group del progetto non
 * scadevano. Due ragioni per metterci un termine, la seconda più importante
 * della prima: la spesa cresce indefinitamente, e soprattutto **nei log
 * finiscono dati personali** — è leggendo gli ARN nei messaggi d'errore di SES
 * che il 3 agosto ho ricostruito gli indirizzi dei destinatari falliti.
 * Conservarli per sempre contraddice la minimizzazione dichiarata
 * nell'informativa.
 *
 * Perché 90 e non 30: quell'indagine ha dovuto guardare a una decina di giorni
 * indietro ed è partita in ritardo. Novanta giorni lasciano margine a un
 * problema notato tardi senza trasformare i log in un archivio perpetuo.
 */
const SCADENZA_LOG = RetentionDays.THREE_MONTHS;

/**
 * Wrapper attorno a NodejsFunction con i default del progetto.
 *
 * Bundling via esbuild. Il runtime Node.js 20 include già l'AWS SDK v3, quindi
 * `@aws-sdk/*` è marcato external (non viene impacchettato). Nessun nome fisico
 * (naming auto CDK).
 */
export class NodeFunctionConstruct extends Construct {
  public readonly fn: NodejsFunction;

  constructor(scope: Construct, id: string, props: NodeFunctionConstructProps) {
    super(scope, id);

    this.fn = new NodejsFunction(this, 'Fn', {
      entry: props.entry,
      handler: 'handler',
      runtime: Runtime.NODEJS_20_X,
      memorySize: 256,
      timeout: Duration.seconds(15),
      environment: props.environment,
      description: props.description,
      // `logRetention` è deprecato in favore di `logGroup`, ma qui è la scelta
      // corretta: `logGroup` farebbe scrivere le funzioni in log group NUOVI,
      // lasciando i venti esistenti orfani e ancora senza scadenza — cioè col
      // problema intatto e la cronologia separata in due posti. Questo invece
      // applica la scadenza ai gruppi che già ci sono.
      logRetention: props.logRetention ?? SCADENZA_LOG,
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node20',
        externalModules: ['@aws-sdk/*'],
      },
    });
  }
}
