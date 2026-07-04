/**
 * Configurazione del progetto (serverless).
 *
 * Fork del template CDK: la parte EC2/VPC (vpc/compute/storage/secrets) è stata
 * rimossa perché l'architettura di "Guardia nel Cuore" è 100% serverless
 * (Lambda + API Gateway + DynamoDB + Cognito + S3/CloudFront + SES) e non usa VPC.
 *
 * @example
 * ```typescript
 * const config: ProjectConfig = {
 *   projectName: 'guardia-nel-cuore',
 *   projectCode: 'GNC',
 *   environment: 'prod',
 *   account: '324908170418',
 *   region: 'eu-west-1',
 *   // ... rest of configuration
 * };
 * ```
 */
export interface ProjectConfig {
  /** Nome progetto usato nel naming risorse (lowercase, trattini ammessi) */
  projectName: string;
  /** Codice breve progetto (2-4 caratteri maiuscoli) usato nei nomi risorsa */
  projectCode: string;
  /** Chi gestisce l'infrastruttura (tipicamente 'CF' per CDK/CloudFormation) */
  managedBy: string;
  /** Ambiente target: 'dev' | 'staging' | 'prod' (attualmente solo 'prod') */
  environment: 'dev' | 'staging' | 'prod';
  /** AWS Account ID (12 cifre) */
  account: string;
  /** AWS Region (es. 'eu-west-1') */
  region: string;

  // Tags applicati automaticamente dal TaggingAspect
  tags: {
    description?: string;  // Descrizione dell'oggetto
    project: string;        // Progetto di riferimento
    environment: string;    // Ambiente applicativo (PRD, STG, TST, DEV, etc.)
    name?: string;          // Nome dell'oggetto (gestito automaticamente da NamingAspect)
    managedBy: string;      // Strumento di gestione (CF, TF, OT, Manual)
    owner: string;          // Gruppo o persona di riferimento
    backup?: string;        // Tag legacy per compatibilità
  };

  // Feature flag per stack opzionali (attivate in compose())
  features: {
    /**
     * DNS/Route53 per i sottodomini dell'app.
     * In v1 la hosted zone `feed.guardianelcuore.it` sta nell'account di
     * progetto con delega NS dall'account main. Abilitato all'Incremento 4.
     */
    dns?: {
      enabled: boolean;
      /** Dominio della hosted zone, es. `feed.guardianelcuore.it` */
      domain: string;
    };
  };
}

/**
 * Configurazione specifica per environment.
 * Contiene solo i dati che cambiano tra ambienti (account, region, features).
 */
export interface EnvironmentConfig {
  /** AWS Account ID per questo environment */
  account: string;
  /** AWS Region per questo environment */
  region: string;
  /** Feature flag specifiche per environment */
  features?: ProjectConfig['features'];
}

/**
 * Configurazione comune a tutti gli ambienti (identità del progetto).
 */
export interface CommonConfig {
  /** Nome progetto (condiviso tra tutti gli ambienti) */
  projectName: string;
  /** Codice progetto (condiviso tra tutti gli ambienti) */
  projectCode: string;
  /** Identificativo gestore infrastruttura (CF, TF, OT, Manual) */
  managedBy: string;
  /** Owner - gruppo o persona di riferimento per la gestione */
  owner: string;
}
