import { Construct } from 'constructs';
import { Stack, StackProps, CfnOutput, RemovalPolicy } from 'aws-cdk-lib';
import { ProjectConfig } from '../config/interfaces';
import { DynamoTablesConstruct } from '../constructs/database/dynamo-tables';

export interface DataStackProps extends StackProps {
  config: ProjectConfig;
}

/**
 * Stack dei dati: le 4 tabelle DynamoDB dell'app.
 *
 * Espone nomi e ARN delle tabelle come stringhe, così l'ApiStack (Incremento 3)
 * può concedere alle Lambda i permessi minimi via ARN (convenzione cross-stack:
 * si passano stringhe, mai oggetti CDK).
 */
export class DataStack extends Stack {
  public readonly feedbacksTableName: string;
  public readonly votesTableName: string;
  public readonly categoriesTableName: string;
  public readonly commentsTableName: string;

  public readonly feedbacksTableArn: string;
  public readonly votesTableArn: string;
  public readonly categoriesTableArn: string;
  public readonly commentsTableArn: string;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    // TODO(go-live): impostare RemovalPolicy.RETAIN per non perdere i dati.
    const removalPolicy = RemovalPolicy.DESTROY;

    const tables = new DynamoTablesConstruct(this, 'Tables', { removalPolicy });

    this.feedbacksTableName = tables.feedbacks.tableName;
    this.votesTableName = tables.votes.tableName;
    this.categoriesTableName = tables.categories.tableName;
    this.commentsTableName = tables.comments.tableName;

    this.feedbacksTableArn = tables.feedbacks.tableArn;
    this.votesTableArn = tables.votes.tableArn;
    this.categoriesTableArn = tables.categories.tableArn;
    this.commentsTableArn = tables.comments.tableArn;

    const code = props.config.projectCode;
    new CfnOutput(this, 'FeedbacksTableName', { value: this.feedbacksTableName, exportName: `${code}-feedbacks-table` });
    new CfnOutput(this, 'VotesTableName', { value: this.votesTableName, exportName: `${code}-votes-table` });
    new CfnOutput(this, 'CategoriesTableName', { value: this.categoriesTableName, exportName: `${code}-categories-table` });
    new CfnOutput(this, 'CommentsTableName', { value: this.commentsTableName, exportName: `${code}-comments-table` });
  }
}
