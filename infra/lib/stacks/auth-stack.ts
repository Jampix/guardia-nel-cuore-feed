import { Construct } from 'constructs';
import { Stack, StackProps, CfnOutput, RemovalPolicy } from 'aws-cdk-lib';
import { ProjectConfig } from '../config/interfaces';
import { UserPoolConstruct } from '../constructs/auth/user-pool';

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

    // TODO(go-live): impostare RemovalPolicy.RETAIN per non perdere gli utenti.
    const removalPolicy = RemovalPolicy.DESTROY;

    const auth = new UserPoolConstruct(this, 'Auth', { removalPolicy });

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
