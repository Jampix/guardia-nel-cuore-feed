import * as path from 'path';
import { Construct } from 'constructs';
import { Stack, StackProps, CfnOutput, Duration } from 'aws-cdk-lib';
import { HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { UserPool, UserPoolClient } from 'aws-cdk-lib/aws-cognito';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Alarm, ComparisonOperator, MathExpression, Metric, TreatMissingData } from 'aws-cdk-lib/aws-cloudwatch';
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { EmailSubscription } from 'aws-cdk-lib/aws-sns-subscriptions';
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
  votesTableArn: string;
  votesTableName: string;
  commentsTableArn: string;
  commentsTableName: string;
  // Da StorageStack (stringhe)
  photoBucketArn: string;
  photoBucketName: string;
  /** Email per gli allarmi operativi (errori Lambda + 5xx API). Se omessa, niente allarmi. */
  alertEmail?: string;
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
    const photoBucket = Bucket.fromBucketArn(this, 'PhotoBucket', props.photoBucketArn);
    const votes = Table.fromTableArn(this, 'VotesTable', props.votesTableArn);
    const comments = Table.fromTableArn(this, 'CommentsTable', props.commentsTableArn);

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

    // GET /feedback/public (pubblica) — bacheca. Legge il bucket foto per
    // generare gli URL GET prefirmati (grantRead → s3:GetObject).
    const listPublicFeedbackFn = new NodeFunctionConstruct(this, 'ListPublicFeedbackFn', {
      entry: path.join(handlersDir, 'list-public-feedback.ts'),
      environment: {
        FEEDBACKS_TABLE: props.feedbacksTableName,
        PHOTO_BUCKET: props.photoBucketName,
      },
      description: 'Guardia nel Cuore - bacheca pubblica',
    });
    feedbacks.grantReadData(listPublicFeedbackFn.fn);

    // GET /feedback/mine (autenticata) — le proposte dell'utente (GSI byAutore)
    const listMyFeedbackFn = new NodeFunctionConstruct(this, 'ListMyFeedbackFn', {
      entry: path.join(handlersDir, 'list-my-feedback.ts'),
      environment: {
        FEEDBACKS_TABLE: props.feedbacksTableName,
        PHOTO_BUCKET: props.photoBucketName,
      },
      description: 'Guardia nel Cuore - i miei feedback',
    });
    feedbacks.grantReadData(listMyFeedbackFn.fn);
    photoBucket.grantRead(listMyFeedbackFn.fn);
    photoBucket.grantRead(listPublicFeedbackFn.fn);

    // POST /uploads/presign (autenticata) — URL prefirmato per upload foto
    const presignUploadFn = new NodeFunctionConstruct(this, 'PresignUploadFn', {
      entry: path.join(handlersDir, 'presign-upload.ts'),
      environment: { PHOTO_BUCKET: props.photoBucketName },
      description: 'Guardia nel Cuore - presigned URL upload foto',
    });
    photoBucket.grantPut(presignUploadFn.fn);

    // GET /admin/feedback (autenticata + controllo gruppo nell'handler) — backoffice
    const listAdminFeedbackFn = new NodeFunctionConstruct(this, 'ListAdminFeedbackFn', {
      entry: path.join(handlersDir, 'list-admin-feedback.ts'),
      environment: {
        FEEDBACKS_TABLE: props.feedbacksTableName,
        PHOTO_BUCKET: props.photoBucketName,
      },
      description: 'Guardia nel Cuore - lista feedback (backoffice)',
    });
    feedbacks.grantReadData(listAdminFeedbackFn.fn);
    photoBucket.grantRead(listAdminFeedbackFn.fn);

    // PATCH /admin/feedback/{id} (autenticata + gruppo) — moderazione.
    // Al cambio stato invia email all'autore (SES) risolvendone l'indirizzo
    // da Cognito (AdminGetUser). Email best-effort nell'handler.
    const emailDomain = props.config.features.dns?.domain;
    const patchFeedbackFn = new NodeFunctionConstruct(this, 'PatchFeedbackFn', {
      entry: path.join(handlersDir, 'patch-feedback.ts'),
      environment: {
        FEEDBACKS_TABLE: props.feedbacksTableName,
        USER_POOL_ID: props.userPoolId,
        ...(emailDomain
          ? { FROM_EMAIL: `noreply@${emailDomain}`, CLIENT_URL: `https://${emailDomain}` }
          : {}),
      },
      description: 'Guardia nel Cuore - moderazione feedback',
    });
    feedbacks.grantWriteData(patchFeedbackFn.fn);
    userPool.grant(patchFeedbackFn.fn, 'cognito-idp:AdminGetUser');
    if (emailDomain) {
      patchFeedbackFn.fn.addToRolePolicy(
        new PolicyStatement({
          actions: ['ses:SendEmail'],
          resources: [`arn:aws:ses:${this.region}:${this.account}:identity/${emailDomain}`],
        }),
      );
    }

    // /admin/categories (autenticata + gruppo) — CRUD categorie (1 Lambda, 4 rotte)
    const adminCategoriesFn = new NodeFunctionConstruct(this, 'AdminCategoriesFn', {
      entry: path.join(handlersDir, 'admin-categories.ts'),
      environment: { CATEGORIES_TABLE: props.categoriesTableName },
      description: 'Guardia nel Cuore - CRUD categorie (backoffice)',
    });
    categories.grantReadWriteData(adminCategoriesFn.fn);

    // /admin/users (autenticata + gruppo) — gestione iscrizioni (approvazione)
    const adminUsersFn = new NodeFunctionConstruct(this, 'AdminUsersFn', {
      entry: path.join(handlersDir, 'admin-users.ts'),
      environment: {
        USER_POOL_ID: props.userPoolId,
        ...(emailDomain
          ? { FROM_EMAIL: `noreply@${emailDomain}`, CLIENT_URL: `https://${emailDomain}` }
          : {}),
      },
      description: 'Guardia nel Cuore - iscrizioni cittadini (approvazione)',
    });
    userPool.grant(
      adminUsersFn.fn,
      'cognito-idp:ListUsers',
      'cognito-idp:ListUsersInGroup',
      'cognito-idp:AdminAddUserToGroup',
      'cognito-idp:AdminDeleteUser',
      'cognito-idp:AdminGetUser',
    );
    if (emailDomain) {
      adminUsersFn.fn.addToRolePolicy(
        new PolicyStatement({
          actions: ['ses:SendEmail'],
          resources: [`arn:aws:ses:${this.region}:${this.account}:identity/${emailDomain}`],
        }),
      );
    }

    // /feedback/{id}/vote (autenticata) — voto cittadino (GET/POST/DELETE, 1 Lambda)
    const voteFn = new NodeFunctionConstruct(this, 'FeedbackVoteFn', {
      entry: path.join(handlersDir, 'feedback-vote.ts'),
      environment: {
        VOTES_TABLE: props.votesTableName,
        FEEDBACKS_TABLE: props.feedbacksTableName,
      },
      description: 'Guardia nel Cuore - voto feedback',
    });
    votes.grantReadWriteData(voteFn.fn);
    feedbacks.grantReadWriteData(voteFn.fn); // read: readCount() legge numeroVoti; write: contatore (transazione)

    // POST /feedback/{id}/report (autenticata) — segnalazione contenuti
    const reportFeedbackFn = new NodeFunctionConstruct(this, 'ReportFeedbackFn', {
      entry: path.join(handlersDir, 'report-feedback.ts'),
      environment: {
        FEEDBACKS_TABLE: props.feedbacksTableName,
        COMMENTS_TABLE: props.commentsTableName,
      },
      description: 'Guardia nel Cuore - segnalazione contenuti',
    });
    comments.grantWriteData(reportFeedbackFn.fn);
    feedbacks.grantWriteData(reportFeedbackFn.fn);

    // GET /admin/feedback/{id}/reports (staff) — motivi delle segnalazioni
    const listReportsFn = new NodeFunctionConstruct(this, 'ListFeedbackReportsFn', {
      entry: path.join(handlersDir, 'list-feedback-reports.ts'),
      environment: { COMMENTS_TABLE: props.commentsTableName },
      description: 'Guardia nel Cuore - motivi segnalazioni (backoffice)',
    });
    comments.grantReadData(listReportsFn.fn);

    // DELETE /account (autenticata) — cancellazione account (diritto all'oblio GDPR)
    const deleteAccountFn = new NodeFunctionConstruct(this, 'DeleteAccountFn', {
      entry: path.join(handlersDir, 'delete-account.ts'),
      environment: {
        FEEDBACKS_TABLE: props.feedbacksTableName,
        VOTES_TABLE: props.votesTableName,
        PHOTO_BUCKET: props.photoBucketName,
        USER_POOL_ID: props.userPoolId,
      },
      description: 'Guardia nel Cuore - cancellazione account (GDPR)',
    });
    feedbacks.grantReadWriteData(deleteAccountFn.fn);
    votes.grantReadWriteData(deleteAccountFn.fn);
    photoBucket.grantDelete(deleteAccountFn.fn);
    userPool.grant(deleteAccountFn.fn, 'cognito-idp:AdminDeleteUser');

    // CORS ristretto ai domini reali (+ localhost per il dev). Deriva dal dominio
    // configurato: client su `feed.<dominio>`, admin su `admin.feed.<dominio>`.
    // TODO(go-live definitivo): rimuovere http://localhost:4200.
    const domain = props.config.features.dns?.domain;
    const allowOrigins = [
      ...(domain ? [`https://${domain}`, `https://admin.${domain}`] : []),
      'http://localhost:4200',
    ];
    const api = new ApiConstruct(this, 'Api', {
      userPool,
      userPoolClients: [clientApp, adminApp],
      allowOrigins,
    });
    // Contenuti privati: bacheca e categorie richiedono l'autenticazione
    // (accesso riservato ai cittadini approvati).
    api.addRoute(HttpMethod.GET, '/categories', categoriesFn.fn, { authenticated: true });
    api.addRoute(HttpMethod.GET, '/feedback/public', listPublicFeedbackFn.fn, { authenticated: true });
    api.addRoute(HttpMethod.GET, '/feedback/mine', listMyFeedbackFn.fn, { authenticated: true });
    api.addRoute(HttpMethod.POST, '/feedback', createFeedbackFn.fn, { authenticated: true });
    api.addRoute(HttpMethod.POST, '/uploads/presign', presignUploadFn.fn, { authenticated: true });
    api.addRoute(HttpMethod.GET, '/admin/feedback', listAdminFeedbackFn.fn, { authenticated: true });
    api.addRoute(HttpMethod.PATCH, '/admin/feedback/{id}', patchFeedbackFn.fn, { authenticated: true });
    api.addRoute(HttpMethod.GET, '/admin/categories', adminCategoriesFn.fn, { authenticated: true });
    api.addRoute(HttpMethod.POST, '/admin/categories', adminCategoriesFn.fn, { authenticated: true });
    api.addRoute(HttpMethod.PATCH, '/admin/categories/{id}', adminCategoriesFn.fn, { authenticated: true });
    api.addRoute(HttpMethod.DELETE, '/admin/categories/{id}', adminCategoriesFn.fn, { authenticated: true });
    api.addRoute(HttpMethod.GET, '/admin/users', adminUsersFn.fn, { authenticated: true });
    api.addRoute(HttpMethod.GET, '/admin/users/pending', adminUsersFn.fn, { authenticated: true });
    api.addRoute(HttpMethod.POST, '/admin/users/{username}/approve', adminUsersFn.fn, { authenticated: true });
    api.addRoute(HttpMethod.DELETE, '/admin/users/{username}', adminUsersFn.fn, { authenticated: true });
    api.addRoute(HttpMethod.GET, '/feedback/{id}/vote', voteFn.fn, { authenticated: true });
    api.addRoute(HttpMethod.POST, '/feedback/{id}/vote', voteFn.fn, { authenticated: true });
    api.addRoute(HttpMethod.DELETE, '/feedback/{id}/vote', voteFn.fn, { authenticated: true });
    api.addRoute(HttpMethod.DELETE, '/account', deleteAccountFn.fn, { authenticated: true });
    api.addRoute(HttpMethod.POST, '/feedback/{id}/report', reportFeedbackFn.fn, { authenticated: true });
    api.addRoute(HttpMethod.GET, '/admin/feedback/{id}/reports', listReportsFn.fn, { authenticated: true });

    this.apiUrl = api.api.apiEndpoint;
    new CfnOutput(this, 'ApiUrl', {
      value: this.apiUrl,
      exportName: `${props.config.projectCode}-api-url`,
    });

    // ----- Allarmi operativi (opzionali) -----
    // Un solo topic SNS con email: alla prima sottoscrizione arriva 1 email di
    // conferma da cliccare. Poi ricevi gli avvisi quando qualcosa si rompe.
    if (props.alertEmail) {
      const alertsTopic = new Topic(this, 'OpsAlerts', {
        displayName: `Guardia nel Cuore - allarmi ${props.config.environment}`,
      });
      alertsTopic.addSubscription(new EmailSubscription(props.alertEmail));
      const action = new SnsAction(alertsTopic);

      // 1) Errori Lambda (somma su tutte le funzioni dell'API): >=1 in 5 min.
      const fns = [
        categoriesFn, createFeedbackFn, listPublicFeedbackFn, listMyFeedbackFn,
        presignUploadFn, listAdminFeedbackFn, patchFeedbackFn, adminCategoriesFn,
        adminUsersFn, voteFn,
      ].map((c) => c.fn);
      const usingMetrics: Record<string, Metric> = {};
      fns.forEach((fn, i) => {
        usingMetrics[`e${i}`] = fn.metricErrors({ period: Duration.minutes(5), statistic: 'Sum' });
      });
      const lambdaErrors = new MathExpression({
        expression: Object.keys(usingMetrics).join('+'),
        usingMetrics,
        period: Duration.minutes(5),
        label: 'Errori Lambda (totali)',
      });
      new Alarm(this, 'LambdaErrorsAlarm', {
        metric: lambdaErrors,
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: TreatMissingData.NOT_BREACHING,
        alarmDescription: 'Una o più Lambda dell\'API hanno restituito un errore.',
      }).addAlarmAction(action);

      // 2) 5xx dell'HTTP API: errori lato server percepiti dai cittadini.
      const api5xx = new Metric({
        namespace: 'AWS/ApiGateway',
        metricName: '5xx',
        dimensionsMap: { ApiId: api.api.apiId },
        statistic: 'Sum',
        period: Duration.minutes(5),
      });
      new Alarm(this, 'Api5xxAlarm', {
        metric: api5xx,
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: TreatMissingData.NOT_BREACHING,
        alarmDescription: 'L\'API ha restituito errori 5xx ai client.',
      }).addAlarmAction(action);
    }
  }
}
