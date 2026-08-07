import { Construct } from 'constructs';
import { Stack, StackProps, CfnOutput, RemovalPolicy } from 'aws-cdk-lib';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { HostedZone } from 'aws-cdk-lib/aws-route53';
import { ProjectConfig } from '../config/interfaces';
import { StaticSite } from '../constructs/cdn/static-site';

export interface FrontendStackProps extends StackProps {
  config: ProjectConfig;
  /** Dominio del sito cittadini (apex della zona `feed`). */
  clientDomain: string;
  /** Dominio del backoffice. */
  adminDomain: string;
  /** Nome della hosted zone `feed` (per importarla). */
  zoneName: string;
  /** ID della hosted zone `feed`. */
  hostedZoneId: string;
  /** ARN del certificato ACM (us-east-1) creato dal CertStack. */
  certificateArn: string;
  /**
   * Endpoint dell'HTTP API (`https://<id>.execute-api.<region>.amazonaws.com`).
   * Serve alla CSP: le SPA devono poter chiamare l'API e **nient'altro**.
   */
  apiEndpoint: string;
  /** Nome del bucket foto: da qui si ricava l'host dei GET/PUT prefirmati. */
  photoBucketName: string;
}

/**
 * Stack frontend: due siti statici (SPA Angular) su distribuzioni CloudFront
 * separate, client e admin, con bucket S3 privati distinti.
 *
 * Due siti separati (non un solo bucket) per isolamento e sicurezza: il
 * backoffice non è raggiungibile dal dominio cittadini. Vedi
 * `docs/02-architettura-aws.md` §Hosting FE.
 *
 * Solo infrastruttura: i file delle app vengono pubblicati separatamente
 * (CI/CD o `aws s3 sync`), non da questo stack.
 *
 * Cross-region: il certificato vive in us-east-1 e viene importato per ARN
 * (stringa), la zona `feed` in eu-west-1 per attributi (id+nome).
 */
export class FrontendStack extends Stack {
  public readonly clientBucketName: string;
  public readonly clientDistributionId: string;
  public readonly adminBucketName: string;
  public readonly adminDistributionId: string;

  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    // Bucket dei soli artefatti di build: ricostruibili, quindi eliminabili.
    const removalPolicy = RemovalPolicy.DESTROY;

    const certificate = Certificate.fromCertificateArn(this, 'SiteCertificate', props.certificateArn);
    const hostedZone = HostedZone.fromHostedZoneAttributes(this, 'FeedZone', {
      hostedZoneId: props.hostedZoneId,
      zoneName: props.zoneName,
    });

    // Origini della CSP, DERIVATE dagli altri stack e non scritte a mano: se un
    // giorno l'API o il bucket venissero ricreati, la policy segue. Host esatti
    // e non `*.execute-api…`/`*.s3…`: con un carattere jolly basterebbe creare
    // un'API o un bucket propri nella stessa regione per aggirare la CSP, e
    // l'unica cosa che protegge (il token in localStorage) tornerebbe esposta.
    const photoOrigin = `https://${props.photoBucketName}.s3.${this.region}.amazonaws.com`;
    const connectSrc = [
      props.apiEndpoint,
      `https://cognito-idp.${this.region}.amazonaws.com`, // Amplify: registrazione, accesso, recupero password
      photoOrigin, // PUT prefirmato della foto
      'https://nominatim.openstreetmap.org', // indirizzo ↔ punto sulla mappa
    ];
    const imgSrc = [
      photoOrigin, // foto servite con GET prefirmato
      'https://*.tile.openstreetmap.org', // tessere della mappa (host a rotazione a/b/c)
    ];

    const client = new StaticSite(this, 'Client', {
      domainName: props.clientDomain,
      certificate,
      hostedZone,
      removalPolicy,
      connectSrc,
      imgSrc,
    });

    // Il backoffice non carica foto ma le MOSTRA, e non usa la mappa. Riceve le
    // stesse origini: distinguere aggiungerebbe una seconda lista da tenere
    // allineata in cambio di nulla, perché sono gli stessi host.
    const admin = new StaticSite(this, 'Admin', {
      domainName: props.adminDomain,
      certificate,
      hostedZone,
      removalPolicy,
      connectSrc,
      imgSrc,
    });

    this.clientBucketName = client.bucket.bucketName;
    this.clientDistributionId = client.distribution.distributionId;
    this.adminBucketName = admin.bucket.bucketName;
    this.adminDistributionId = admin.distribution.distributionId;

    const code = props.config.projectCode;
    new CfnOutput(this, 'ClientBucketName', { value: this.clientBucketName, exportName: `${code}-client-bucket-name` });
    new CfnOutput(this, 'ClientDistributionId', { value: this.clientDistributionId, exportName: `${code}-client-distribution-id` });
    new CfnOutput(this, 'AdminBucketName', { value: this.adminBucketName, exportName: `${code}-admin-bucket-name` });
    new CfnOutput(this, 'AdminDistributionId', { value: this.adminDistributionId, exportName: `${code}-admin-distribution-id` });
  }
}
