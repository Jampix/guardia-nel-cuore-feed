import { Construct } from 'constructs';
import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { HostedZone, IHostedZone } from 'aws-cdk-lib/aws-route53';
import { DnsCertificate } from '../constructs/dns/dns-certificate';

export interface CertStackProps extends StackProps {
  projectName: string;
  /** Nome della hosted zone `feed`, es. `feed.guardianelcuore.it` */
  zoneName: string;
  /** ID della hosted zone `feed` (import cross-region come stringa) */
  hostedZoneId: string;
}

/**
 * Certificato ACM per CloudFront.
 *
 * CloudFront accetta certificati SOLO in `us-east-1`, quindi questo stack va
 * composto con `env: { region: 'us-east-1' }` (vedi `compose()`), mentre la
 * hosted zone `feed` vive in `eu-west-1`.
 *
 * Cross-region: CloudFormation non importa output tra region diverse, perciò
 * la zona NON si passa come oggetto/token ma si importa per ID+nome (stringhe)
 * con `fromHostedZoneAttributes`. Route53 e' globale: la validazione DNS
 * (`fromDns`) crea i record CNAME nella zona `feed` anche da uno stack us-east-1.
 *
 * Copertura (nomi espliciti, non wildcard):
 *   - `feed.guardianelcuore.it`        (frontend cittadini)
 *   - `admin.feed.guardianelcuore.it`  (backoffice associazione)
 *
 * L'ARN del certificato e' esposto come stringa: il FrontendStack lo consumera'
 * come literal cross-region (convenzione di progetto, vedi architettura §7bis).
 */
export class CertStack extends Stack {
  public readonly certificateArn: string;

  constructor(scope: Construct, id: string, props: CertStackProps) {
    super(scope, id, props);

    const hostedZone: IHostedZone = HostedZone.fromHostedZoneAttributes(this, 'FeedZone', {
      hostedZoneId: props.hostedZoneId,
      zoneName: props.zoneName,
    });

    const clientDomain = props.zoneName; // feed.guardianelcuore.it
    const adminDomain = `admin.${props.zoneName}`; // admin.feed.guardianelcuore.it

    const cert = new DnsCertificate(this, 'SiteCertificate', {
      hostedZone,
      domainName: clientDomain,
      // clientDomain e' gia' l'apex della zona: niente apex automatico (eviterebbe
      // un SAN duplicato). Aggiungiamo esplicitamente il sottodominio admin.
      includeApex: false,
      additionalSans: [adminDomain],
      productionMode: true,
    });

    this.certificateArn = cert.certificate.certificateArn;

    new CfnOutput(this, 'CertificateArn', {
      value: this.certificateArn,
      description: 'ARN certificato ACM (us-east-1) per CloudFront',
      exportName: `${props.projectName}-certificate-arn`,
    });
  }
}
