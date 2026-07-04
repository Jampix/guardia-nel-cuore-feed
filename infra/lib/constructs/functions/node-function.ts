import { Duration } from 'aws-cdk-lib';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';

export interface NodeFunctionConstructProps {
  /** Path al file handler TypeScript (in /backend). */
  entry: string;
  /** Variabili d'ambiente della funzione. */
  environment?: Record<string, string>;
  /** Descrizione della funzione. */
  description?: string;
}

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
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node20',
        externalModules: ['@aws-sdk/*'],
      },
    });
  }
}
