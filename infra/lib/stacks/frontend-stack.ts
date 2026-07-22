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

    const client = new StaticSite(this, 'Client', {
      domainName: props.clientDomain,
      certificate,
      hostedZone,
      removalPolicy,
    });

    const admin = new StaticSite(this, 'Admin', {
      domainName: props.adminDomain,
      certificate,
      hostedZone,
      removalPolicy,
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
