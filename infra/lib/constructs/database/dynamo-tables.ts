import { RemovalPolicy } from 'aws-cdk-lib';
import {
  AttributeType,
  BillingMode,
  ProjectionType,
  Table,
} from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface DynamoTablesConstructProps {
  /** RemovalPolicy per le tabelle (DESTROY in costruzione, RETAIN a go-live). */
  removalPolicy: RemovalPolicy;
}

/**
 * Le 4 tabelle DynamoDB dell'app "Guardia nel Cuore" (modello multi-table).
 *
 * Nessun nome fisico impostato: CloudFormation genera nomi deterministici dal
 * logical ID. Billing on-demand (PAY_PER_REQUEST): a questo volume il costo è
 * praticamente nullo. Point-in-time recovery abilitato per sicurezza dati.
 *
 * Vedi `docs/02-architettura-aws.md` §5.
 */
export class DynamoTablesConstruct extends Construct {
  /** Feedback dei cittadini (proposte/segnalazioni/idee). */
  public readonly feedbacks: Table;
  /** Voti sui feedback pubblici (1 voto per utente per feedback). */
  public readonly votes: Table;
  /** Categorie tra cui i cittadini scelgono (gestite dal backoffice). */
  public readonly categories: Table;
  /** Note interne + risposte pubbliche associate a un feedback. */
  public readonly comments: Table;

  constructor(scope: Construct, id: string, props: DynamoTablesConstructProps) {
    super(scope, id);

    const common = {
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: props.removalPolicy,
      pointInTimeRecovery: true,
    };

    // Feedbacks: PK = id
    this.feedbacks = new Table(this, 'Feedbacks', {
      partitionKey: { name: 'id', type: AttributeType.STRING },
      ...common,
    });
    // GSI "byAutore": i feedback di un cittadino, ordinati per data (US-06).
    this.feedbacks.addGlobalSecondaryIndex({
      indexName: 'byAutore',
      partitionKey: { name: 'autoreId', type: AttributeType.STRING },
      sortKey: { name: 'createdAt', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });
    // GSI "byVisibilita": bacheca pubblica, ordinata per data (US-07).
    this.feedbacks.addGlobalSecondaryIndex({
      indexName: 'byVisibilita',
      partitionKey: { name: 'visibilita', type: AttributeType.STRING },
      sortKey: { name: 'createdAt', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    // Votes: PK = feedbackId, SK = userId → garantisce 1 voto per utente.
    this.votes = new Table(this, 'Votes', {
      partitionKey: { name: 'feedbackId', type: AttributeType.STRING },
      sortKey: { name: 'userId', type: AttributeType.STRING },
      ...common,
    });

    // Categories: PK = id
    this.categories = new Table(this, 'Categories', {
      partitionKey: { name: 'id', type: AttributeType.STRING },
      ...common,
    });

    // FeedbackComments: PK = feedbackId, SK = "<tipo>#<timestamp>"
    // (tipo ∈ NOTE | REPLY) → una query per feedback restituisce note+risposte.
    this.comments = new Table(this, 'FeedbackComments', {
      partitionKey: { name: 'feedbackId', type: AttributeType.STRING },
      sortKey: { name: 'sk', type: AttributeType.STRING },
      ...common,
    });
  }
}
