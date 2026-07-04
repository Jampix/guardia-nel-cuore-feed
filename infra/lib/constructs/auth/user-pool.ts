import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import {
  AccountRecovery,
  CfnUserPoolGroup,
  UserPool,
  UserPoolClient,
  VerificationEmailStyle,
} from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

export interface UserPoolConstructProps {
  /** RemovalPolicy per lo user pool (DESTROY in costruzione, RETAIN a go-live). */
  removalPolicy: RemovalPolicy;
}

/**
 * Cognito User Pool per "Guardia nel Cuore".
 *
 * - Registrazione self-service con email verificata (codice OTP via email).
 * - Recupero password via email.
 * - Gruppi: `admin` | `membro` | `cittadino` (il ruolo viaggia nel JWT).
 * - Due app client SPA (public, senza secret): uno per il frontend cittadini,
 *   uno per il backoffice admin.
 *
 * Nessun nome fisico impostato (naming auto CDK). Email inviate tramite il
 * mittente Cognito di default in v1; il passaggio a SES è previsto più avanti.
 */
export class UserPoolConstruct extends Construct {
  public readonly userPool: UserPool;
  public readonly clientAppClient: UserPoolClient;
  public readonly adminAppClient: UserPoolClient;

  constructor(scope: Construct, id: string, props: UserPoolConstructProps) {
    super(scope, id);

    this.userPool = new UserPool(this, 'UserPool', {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
        // Nome pubblico/nickname mostrato sui feedback pubblici (mai l'email).
        nickname: { required: false, mutable: true },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      userVerification: {
        emailStyle: VerificationEmailStyle.CODE,
        emailSubject: 'Guardia nel Cuore — codice di verifica',
        emailBody: 'Il tuo codice di verifica è {####}',
      },
      removalPolicy: props.removalPolicy,
    });

    const clientCommon = {
      userPool: this.userPool,
      generateSecret: false, // SPA public client
      authFlows: { userSrp: true },
      preventUserExistenceErrors: true,
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
    };

    this.clientAppClient = new UserPoolClient(this, 'ClientAppClient', {
      ...clientCommon,
    });
    this.adminAppClient = new UserPoolClient(this, 'AdminAppClient', {
      ...clientCommon,
    });

    const groups = [
      { name: 'admin', precedence: 1, description: "Amministratori dell'associazione" },
      { name: 'membro', precedence: 2, description: "Membri dell'associazione (backoffice)" },
      { name: 'cittadino', precedence: 3, description: 'Cittadini registrati' },
    ];
    for (const g of groups) {
      new CfnUserPoolGroup(this, `Group-${g.name}`, {
        userPoolId: this.userPool.userPoolId,
        groupName: g.name,
        precedence: g.precedence,
        description: g.description,
      });
    }
  }
}
