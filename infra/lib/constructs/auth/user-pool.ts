import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import {
  AccountRecovery,
  CfnUserPoolGroup,
  UserPool,
  UserPoolClient,
  StringAttribute,
  UserPoolEmail,
  VerificationEmailStyle,
} from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

export interface UserPoolConstructProps {
  /** RemovalPolicy per lo user pool (DESTROY in costruzione, RETAIN a go-live). */
  removalPolicy: RemovalPolicy;
  /**
   * Dominio SES verificato da cui inviare (es. `feed.guardianelcuore.it`).
   * Se assente si resta sul mittente Cognito di default.
   *
   * ⚠️ Richiede la PRODUCTION ACCESS di SES: in sandbox SES consegna solo ai
   * destinatari verificati, quindi il codice di verifica non arriverebbe ai
   * nuovi cittadini e nessuno potrebbe registrarsi.
   */
  emailDomain?: string;
  /**
   * Recapito dell'associazione, usato come Reply-To delle email di Cognito
   * (codice di verifica e recupero password).
   *
   * Il mittente è `noreply@<emailDomain>`, che non è una casella: chi rispondeva
   * al codice di verifica — e succede, quando qualcosa non va — scriveva nel
   * vuoto senza saperlo. Non richiede verifica in SES: solo il mittente la
   * richiede, non il destinatario di una risposta.
   */
  replyToEmail?: string;
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
 * Nessun nome fisico impostato (naming auto CDK). Email inviate via SES dal
 * dominio del progetto quando `emailDomain` è valorizzato (vedi props).
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
        // Nome e cognome reali (li vede solo l'associazione, non compaiono in
        // bacheca) NON si dichiarano qui: `given_name` e `family_name` fanno
        // già parte dello schema standard di ogni pool Cognito.
        //
        // ⚠️ Dichiararli ha fatto FALLIRE un deploy con "Invalid
        // AttributeDataType": CDK emette le voci di `standardAttributes` senza
        // il tipo di dato, e su un pool ESISTENTE Cognito valida ogni voce dello
        // Schema e le rifiuta. Alla creazione invece passa. Rollback pulito,
        // nessun dato perso, ma la lezione resta: su questo pool non si
        // aggiungono voci a `standardAttributes`.
      },
      /**
       * Rapporto col paese, dichiarato dall'iscritto: serve all'associazione per
       * pesare le proposte (un residente e un turista hanno voce diversa su una
       * strada). Valori tecnici in snake_case, le etichette stanno nel frontend.
       *
       * ⚠️ In Cognito un attributo personalizzato non si può più RINOMINARE né
       * ELIMINARE: nome e lunghezza sono definitivi. `maxLen` largo di proposito.
       * Verificato con un change set reale che l'aggiunta è una modifica in
       * place e NON una sostituzione del pool (ci sono utenti veri dentro).
       */
      customAttributes: {
        tipoUtente: new StringAttribute({ mutable: true, maxLen: 32 }),
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
      // Invio via SES dal nostro dominio (DKIM allineato) invece del mittente
      // AWS condiviso `no-reply@verificationemail.com`, che finiva in spam e
      // aveva un tetto di 50 email al giorno.
      ...(props.emailDomain
        ? {
            email: UserPoolEmail.withSES({
              fromEmail: `noreply@${props.emailDomain}`,
              fromName: 'Guardia nel Cuore',
              sesVerifiedDomain: props.emailDomain,
              ...(props.replyToEmail ? { replyTo: props.replyToEmail } : {}),
            }),
          }
        : {}),
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
