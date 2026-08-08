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
    // Reply-To di tutte le email: il mittente `noreply@` non riceve posta, quindi
    // senza questo chi risponde a un avviso scrive nel vuoto senza accorgersene.
    const contactEmail = props.config.contactEmail;
    const patchFeedbackFn = new NodeFunctionConstruct(this, 'PatchFeedbackFn', {
      entry: path.join(handlersDir, 'patch-feedback.ts'),
      environment: {
        FEEDBACKS_TABLE: props.feedbacksTableName,
        USER_POOL_ID: props.userPoolId,
        ...(emailDomain
          ? {
              FROM_EMAIL: `noreply@${emailDomain}`,
              CLIENT_URL: `https://${emailDomain}`,
              ...(contactEmail ? { REPLY_TO_EMAIL: contactEmail } : {}),
            }
          : {}),
      },
      description: 'Guardia nel Cuore - moderazione feedback',
    });
    // ReadWrite e non solo Write: l'handler LEGGE la proposta prima di
    // aggiornarla, per capire cosa è davvero cambiato e non spedire un'email a
    // ogni salvataggio (la schermata di moderazione invia sempre tutti i campi).
    feedbacks.grantReadWriteData(patchFeedbackFn.fn);
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
        // La rimozione completa di una persona esegue la stessa pulizia del
        // diritto all'oblio: servono le tabelle e il bucket delle foto.
        FEEDBACKS_TABLE: props.feedbacksTableName,
        VOTES_TABLE: props.votesTableName,
        COMMENTS_TABLE: props.commentsTableName,
        PHOTO_BUCKET: props.photoBucketName,
        ...(emailDomain
          ? {
              FROM_EMAIL: `noreply@${emailDomain}`,
              CLIENT_URL: `https://${emailDomain}`,
              ...(contactEmail ? { REPLY_TO_EMAIL: contactEmail } : {}),
            }
          : {}),
      },
      description: 'Guardia nel Cuore - iscrizioni cittadini (approvazione)',
    });
    userPool.grant(
      adminUsersFn.fn,
      'cognito-idp:ListUsers',
      'cognito-idp:ListUsersInGroup',
      'cognito-idp:AdminAddUserToGroup',
      // Togliere l'accesso senza cancellare nulla: l'operazione giusta quando una
      // proposta è già in bacheca e altri l'hanno sostenuta.
      'cognito-idp:AdminRemoveUserFromGroup',
      'cognito-idp:AdminDeleteUser',
      'cognito-idp:AdminGetUser',
    );
    // Rimozione completa: stessa pulizia del diritto all'oblio.
    feedbacks.grantReadWriteData(adminUsersFn.fn);
    votes.grantReadWriteData(adminUsersFn.fn);
    comments.grantReadWriteData(adminUsersFn.fn);
    photoBucket.grantDelete(adminUsersFn.fn);
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
        // Avviso allo staff a ogni nuova segnalazione.
        ...(emailDomain && props.alertEmail
          ? {
              FROM_EMAIL: `noreply@${emailDomain}`,
              ...(contactEmail ? { REPLY_TO_EMAIL: contactEmail } : {}),
              // Indirizzo di ripiego: i destinatari veri sono i gruppi staff.
              STAFF_EMAIL: props.alertEmail,
              USER_POOL_ID: userPool.userPoolId,
              ADMIN_URL: `https://admin.${emailDomain}`,
            }
          : {}),
      },
      description: 'Guardia nel Cuore - segnalazione contenuti',
    });
    comments.grantWriteData(reportFeedbackFn.fn);
    // ReadWrite: dopo la transazione rilegge titolo e conteggio per l'avviso
    // allo staff (TransactWriteItems non restituisce valori).
    feedbacks.grantReadWriteData(reportFeedbackFn.fn);
    if (emailDomain && props.alertEmail) {
      reportFeedbackFn.fn.addToRolePolicy(
        new PolicyStatement({
          actions: ['ses:SendEmail'],
          resources: [`arn:aws:ses:${this.region}:${this.account}:identity/${emailDomain}`],
        }),
      );
      // Destinatari dell'avviso = i gruppi staff, letti all'invio.
      userPool.grant(reportFeedbackFn.fn, 'cognito-idp:ListUsersInGroup');
    }

    // GET /admin/feedback/{id}/reports (staff) — motivi delle segnalazioni
    const listReportsFn = new NodeFunctionConstruct(this, 'ListFeedbackReportsFn', {
      entry: path.join(handlersDir, 'list-feedback-reports.ts'),
      environment: { COMMENTS_TABLE: props.commentsTableName },
      description: 'Guardia nel Cuore - motivi segnalazioni (backoffice)',
    });
    comments.grantReadData(listReportsFn.fn);

    // PATCH/DELETE /feedback/{id} (autenticata) — gestione della PROPRIA proposta
    const feedbackOwnerFn = new NodeFunctionConstruct(this, 'FeedbackOwnerFn', {
      entry: path.join(handlersDir, 'feedback-owner.ts'),
      environment: {
        FEEDBACKS_TABLE: props.feedbacksTableName,
        VOTES_TABLE: props.votesTableName,
        COMMENTS_TABLE: props.commentsTableName,
        PHOTO_BUCKET: props.photoBucketName,
        // Avviso allo staff quando l'autore elimina una proposta pubblicata o
        // con segnalazioni aperte.
        ...(emailDomain && props.alertEmail
          ? {
              FROM_EMAIL: `noreply@${emailDomain}`,
              ...(contactEmail ? { REPLY_TO_EMAIL: contactEmail } : {}),
              // Indirizzo di ripiego: i destinatari veri sono i gruppi staff.
              STAFF_EMAIL: props.alertEmail,
              USER_POOL_ID: userPool.userPoolId,
              ADMIN_URL: `https://admin.${emailDomain}`,
            }
          : {}),
      },
      description: 'Guardia nel Cuore - modifica/elimina propria proposta',
    });
    feedbacks.grantReadWriteData(feedbackOwnerFn.fn);
    votes.grantReadWriteData(feedbackOwnerFn.fn);
    comments.grantReadWriteData(feedbackOwnerFn.fn);
    photoBucket.grantDelete(feedbackOwnerFn.fn);
    if (emailDomain && props.alertEmail) {
      feedbackOwnerFn.fn.addToRolePolicy(
        new PolicyStatement({
          actions: ['ses:SendEmail'],
          resources: [`arn:aws:ses:${this.region}:${this.account}:identity/${emailDomain}`],
        }),
      );
      // Destinatari dell'avviso = i gruppi staff, letti all'invio.
      userPool.grant(feedbackOwnerFn.fn, 'cognito-idp:ListUsersInGroup');
    }

    // DELETE /account (autenticata) — cancellazione account (diritto all'oblio GDPR)
    const deleteAccountFn = new NodeFunctionConstruct(this, 'DeleteAccountFn', {
      entry: path.join(handlersDir, 'delete-account.ts'),
      environment: {
        FEEDBACKS_TABLE: props.feedbacksTableName,
        VOTES_TABLE: props.votesTableName,
        // Serve per rimuovere le segnalazioni fatte e ricevute: senza questo la
        // cancellazione lasciava riferimenti a chi chiedeva di essere cancellato.
        COMMENTS_TABLE: props.commentsTableName,
        PHOTO_BUCKET: props.photoBucketName,
        USER_POOL_ID: props.userPoolId,
      },
      description: 'Guardia nel Cuore - cancellazione account (GDPR)',
    });
    feedbacks.grantReadWriteData(deleteAccountFn.fn);
    votes.grantReadWriteData(deleteAccountFn.fn);
    comments.grantReadWriteData(deleteAccountFn.fn);
    photoBucket.grantDelete(deleteAccountFn.fn);
    userPool.grant(deleteAccountFn.fn, 'cognito-idp:AdminDeleteUser');

    // CORS ristretto ai SOLI domini reali. Deriva dal dominio configurato:
    // client su `feed.<dominio>`, admin su `admin.feed.<dominio>`.
    //
    // Le origini `localhost` sono state rimosse al lancio pubblico. Lo sviluppo
    // locale continua a funzionare **senza** che siano elencate qui: il dev
    // server Angular fa da proxy (`frontend/proxy.conf.json`, `apiUrl: '/api'`
    // in `environment.development.ts`), quindi le chiamate partono dalla stessa
    // origine della pagina e non sono cross-origin.
    const domain = props.config.features.dns?.domain;
    const allowOrigins = domain ? [`https://${domain}`, `https://admin.${domain}`] : [];
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
    api.addRoute(HttpMethod.POST, '/admin/users/{username}/revoke', adminUsersFn.fn, { authenticated: true });
    api.addRoute(HttpMethod.DELETE, '/admin/users/{username}', adminUsersFn.fn, { authenticated: true });
    api.addRoute(HttpMethod.GET, '/feedback/{id}/vote', voteFn.fn, { authenticated: true });
    api.addRoute(HttpMethod.POST, '/feedback/{id}/vote', voteFn.fn, { authenticated: true });
    api.addRoute(HttpMethod.DELETE, '/feedback/{id}/vote', voteFn.fn, { authenticated: true });
    api.addRoute(HttpMethod.DELETE, '/account', deleteAccountFn.fn, { authenticated: true });
    api.addRoute(HttpMethod.POST, '/feedback/{id}/report', reportFeedbackFn.fn, { authenticated: true });
    api.addRoute(HttpMethod.GET, '/admin/feedback/{id}/reports', listReportsFn.fn, { authenticated: true });
    api.addRoute(HttpMethod.PATCH, '/feedback/{id}', feedbackOwnerFn.fn, { authenticated: true });
    api.addRoute(HttpMethod.DELETE, '/feedback/{id}', feedbackOwnerFn.fn, { authenticated: true });

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

      // 3) Reputazione SES. Fuori dalla sandbox AWS giudica il dominio su
      // rimbalzi e lamentele: mette l'account sotto osservazione oltre il 5% di
      // bounce e lo 0,1% di complaint, e può sospendere l'invio. Sono metriche
      // a livello di ACCOUNT (nessuna dimensione), quindi non serve alcun
      // riferimento all'identità SES: niente dipendenze fra stack.
      // Con i volumi attuali (poche email al giorno) un singolo rimbalzo supera
      // già il 5%: è voluto, a questa scala ogni rimbalzo va guardato.
      const sesReputation = (metricName: string, label: string) =>
        new Metric({
          namespace: 'AWS/SES',
          metricName,
          statistic: 'Average',
          period: Duration.hours(1),
          label,
        });

      new Alarm(this, 'SesBounceRateAlarm', {
        metric: sesReputation('Reputation.BounceRate', 'Tasso di rimbalzo SES'),
        threshold: 0.05,
        evaluationPeriods: 1,
        comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: TreatMissingData.NOT_BREACHING,
        alarmDescription:
          'Tasso di rimbalzo SES oltre il 5%: rischio sospensione invio. Verificare gli indirizzi dei destinatari.',
      }).addAlarmAction(action);

      new Alarm(this, 'SesComplaintRateAlarm', {
        metric: sesReputation('Reputation.ComplaintRate', 'Tasso di lamentele SES'),
        threshold: 0.001,
        evaluationPeriods: 1,
        comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: TreatMissingData.NOT_BREACHING,
        alarmDescription:
          'Tasso di lamentele SES oltre lo 0,1%: qualcuno ha segnalato le email come spam.',
      }).addAlarmAction(action);
    }
  }
}
