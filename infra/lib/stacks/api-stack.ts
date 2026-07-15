import * as path from 'path';
import { Construct } from 'constructs';
import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { UserPool, UserPoolClient } from 'aws-cdk-lib/aws-cognito';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { ProjectConfig } from '../config/interfaces';
import { ApiConstruct } from '../constructs/api/http-api';
import { NodeFunctionConstruct } from '../constructs/functions/node-function';

export interface ApiStackProps extends StackProps {
  config: ProjectConfig;
  // Da AuthStack (stringhe)
  userPoolId: string;
  clientAppClientId: string;
  adminAppClientId: string;
  // Da DataStack (stringhe)
  feedbacksTableArn: string;
  feedbacksTableName: string;
  categoriesTableArn: string;
  categoriesTableName: string;
}

/**
 * Stack API: HTTP API + JWT authorizer Cognito + le Lambda applicative.
 *
 * Importa user pool/client e tabelle tramite stringhe (ID/ARN) provenienti da
 * AuthStack e DataStack, secondo la convenzione cross-stack del template.
 * Primo slice: `GET /categories` (pubblica) e `POST /feedback` (autenticata).
 */
export class ApiStack extends Stack {
  public readonly apiUrl: string;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const handlersDir = path.join(__dirname, '..', '..', '..', 'backend', 'src', 'handlers');

    // Import da altri stack (per ID/ARN)
    const userPool = UserPool.fromUserPoolId(this, 'UserPool', props.userPoolId);
    const clientApp = UserPoolClient.fromUserPoolClientId(this, 'ClientApp', props.clientAppClientId);
    const adminApp = UserPoolClient.fromUserPoolClientId(this, 'AdminApp', props.adminAppClientId);
    // grantIndexPermissions: i grant includono anche gli indici (`/index/*`),
    // necessario perché la bacheca interroga il GSI `byVisibilita`.
    const feedbacks = Table.fromTableAttributes(this, 'FeedbacksTable', {
      tableArn: props.feedbacksTableArn,
      grantIndexPermissions: true,
    });
    const categories = Table.fromTableArn(this, 'CategoriesTable', props.categoriesTableArn);

    // GET /categories (pubblica)
    const categoriesFn = new NodeFunctionConstruct(this, 'CategoriesFn', {
      entry: path.join(handlersDir, 'categories.ts'),
      environment: { CATEGORIES_TABLE: props.categoriesTableName },
      description: 'Guardia nel Cuore - lista categorie attive',
    });
    categories.grantReadData(categoriesFn.fn);

    // POST /feedback (autenticata)
    const createFeedbackFn = new NodeFunctionConstruct(this, 'CreateFeedbackFn', {
      entry: path.join(handlersDir, 'create-feedback.ts'),
      environment: { FEEDBACKS_TABLE: props.feedbacksTableName },
      description: 'Guardia nel Cuore - crea feedback',
    });
    feedbacks.grantWriteData(createFeedbackFn.fn);

    // GET /feedback/public (pubblica) — bacheca
    const listPublicFeedbackFn = new NodeFunctionConstruct(this, 'ListPublicFeedbackFn', {
      entry: path.join(handlersDir, 'list-public-feedback.ts'),
      environment: { FEEDBACKS_TABLE: props.feedbacksTableName },
      description: 'Guardia nel Cuore - bacheca pubblica',
    });
    feedbacks.grantReadData(listPublicFeedbackFn.fn);

    const api = new ApiConstruct(this, 'Api', {
      userPool,
      userPoolClients: [clientApp, adminApp],
      allowOrigins: ['*'], // TODO(Incremento 4): restringere ai domini reali
    });
    api.addRoute(HttpMethod.GET, '/categories', categoriesFn.fn, { authenticated: false });
    api.addRoute(HttpMethod.GET, '/feedback/public', listPublicFeedbackFn.fn, { authenticated: false });
    api.addRoute(HttpMethod.POST, '/feedback', createFeedbackFn.fn, { authenticated: true });

    this.apiUrl = api.api.apiEndpoint;
    new CfnOutput(this, 'ApiUrl', {
      value: this.apiUrl,
      exportName: `${props.config.projectCode}-api-url`,
    });
  }
}
