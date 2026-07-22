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

    const auth = new UserPoolConstruct(this, 'Auth', { removalPolicy });

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
