import * as path from 'path';
import { Construct } from 'constructs';
import { Stack, StackProps, CfnOutput, RemovalPolicy } from 'aws-cdk-lib';
import { UserPoolOperation } from 'aws-cdk-lib/aws-cognito';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { ProjectConfig } from '../config/interfaces';
import { UserPoolConstruct } from '../constructs/auth/user-pool';
import { NodeFunctionConstruct } from '../constructs/functions/node-function';

export interface AuthStackProps extends StackProps {
  config: ProjectConfig;
}

/**
 * Stack di autenticazione: Cognito User Pool + gruppi + app client.
 *
 * Espone come stringhe l'ID/ARN dello user pool e gli ID dei due app client,
 * usati da: ApiStack (JWT authorizer, Incremento 3) e dai frontend Angular
 * (Incremento 4).
 */
export class AuthStack extends Stack {
  public readonly userPoolId: string;
  public readonly userPoolArn: string;
  public readonly clientAppClientId: string;
  public readonly adminAppClientId: string;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    // Go-live: RETAIN per non perdere gli utenti a un destroy accidentale.
    const removalPolicy = RemovalPolicy.RETAIN;

    // Mittente delle email Cognito: il dominio della zona `feed`, verificato
    // in SES con DKIM dal DnsStack. Preso dalla config, non fisso nel codice.
    const dns = props.config.features.dns;
    const emailDomain = dns?.enabled ? dns.domain : undefined;

    // Reply-To: il recapito dell'associazione. Il mittente è `noreply@`, che non
    // riceve posta, quindi senza questo una risposta al codice di verifica o a un
    // avviso si perde senza che chi ha scritto lo sappia.
    const contactEmail = props.config.contactEmail;

    const auth = new UserPoolConstruct(this, 'Auth', {
      removalPolicy,
      emailDomain,
      replyToEmail: contactEmail,
    });

    // Trigger Pre-Authentication: blocca il login dei cittadini non approvati
    // (chi non è in alcun gruppo). L'approvazione avviene dal backoffice
    // aggiungendo l'utente al gruppo `cittadino`.
    const preAuthFn = new NodeFunctionConstruct(this, 'PreAuthFn', {
      entry: path.join(__dirname, '..', '..', '..', 'backend', 'src', 'handlers', 'pre-auth.ts'),
      description: 'Guardia nel Cuore - gate login (approvazione staff)',
    });
    auth.userPool.addTrigger(UserPoolOperation.PRE_AUTHENTICATION, preAuthFn.fn);
    // Permesso con ARN wildcard (non il costrutto pool) per evitare la
    // dipendenza circolare pool→trigger→policy→pool. Scope: pool di questo account.
    preAuthFn.fn.addToRolePolicy(
      new PolicyStatement({
        actions: ['cognito-idp:AdminListGroupsForUser'],
        resources: [`arn:aws:cognito-idp:${this.region}:${this.account}:userpool/*`],
      }),
    );

    // Trigger Post-Confirmation: appena il cittadino verifica l'email lo ATTIVA
    // (lo aggiunge al gruppo `cittadino`), avvisa lo STAFF della nuova iscrizione
    // e conferma al CITTADINO che può accedere.
    //
    // L'approvazione manuale è stata rimossa l'8 agosto 2026: il gate del pre-auth
    // resta come interruttore per togliere l'accesso a qualcuno, non come attesa.
    const staffEmail = props.config.alerts?.email;
    if (emailDomain && staffEmail) {
      const postConfirmFn = new NodeFunctionConstruct(this, 'PostConfirmFn', {
        entry: path.join(__dirname, '..', '..', '..', 'backend', 'src', 'handlers', 'post-confirmation.ts'),
        description: 'Guardia nel Cuore - avvisi di nuova iscrizione',
        environment: {
          FROM_EMAIL: `noreply@${emailDomain}`,
          STAFF_EMAIL: staffEmail,
          CLIENT_URL: `https://${emailDomain}`,
          ADMIN_URL: `https://admin.${emailDomain}`,
          ...(contactEmail ? { REPLY_TO_EMAIL: contactEmail } : {}),
        },
      });
      auth.userPool.addTrigger(UserPoolOperation.POST_CONFIRMATION, postConfirmFn.fn);
      postConfirmFn.fn.addToRolePolicy(
        new PolicyStatement({
          actions: ['ses:SendEmail'],
          resources: [`arn:aws:ses:${this.region}:${this.account}:identity/${emailDomain}`],
        }),
      );
      // L'avviso va a TUTTO lo staff, letto dai gruppi al momento dell'invio:
      // aggiungere una persona al gruppo basta a farle ricevere gli avvisi.
      // ARN wildcard e pool preso da `event.userPoolId` per la stessa ragione
      // del pre-auth: il costrutto pool creerebbe la dipendenza circolare.
      // `AdminAddUserToGroup` attiva il nuovo iscritto; `ListUsersInGroup` serve a
      // trovare i destinatari dell'avviso. Stesso ARN wildcard: il costrutto pool
      // qui creerebbe la dipendenza circolare pool→trigger→policy→pool.
      postConfirmFn.fn.addToRolePolicy(
        new PolicyStatement({
          actions: ['cognito-idp:ListUsersInGroup', 'cognito-idp:AdminAddUserToGroup'],
          resources: [`arn:aws:cognito-idp:${this.region}:${this.account}:userpool/*`],
        }),
      );
    }

    this.userPoolId = auth.userPool.userPoolId;
    this.userPoolArn = auth.userPool.userPoolArn;
    this.clientAppClientId = auth.clientAppClient.userPoolClientId;
    this.adminAppClientId = auth.adminAppClient.userPoolClientId;

    const code = props.config.projectCode;
    new CfnOutput(this, 'UserPoolId', { value: this.userPoolId, exportName: `${code}-user-pool-id` });
    new CfnOutput(this, 'UserPoolArn', { value: this.userPoolArn, exportName: `${code}-user-pool-arn` });
    new CfnOutput(this, 'ClientAppClientId', { value: this.clientAppClientId, exportName: `${code}-client-app-client-id` });
    new CfnOutput(this, 'AdminAppClientId', { value: this.adminAppClientId, exportName: `${code}-admin-app-client-id` });
  }
}
