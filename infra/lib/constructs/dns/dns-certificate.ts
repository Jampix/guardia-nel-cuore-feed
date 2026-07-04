/**
 * Construct riusabile per certificati ACM con validazione DNS.
 *
 * Note sulla cross-region per CloudFront:
 * CloudFront richiede certificati in us-east-1. Il pattern corretto in CDK
 * non e' passare un parametro `region` (non esiste su `CertificateProps`):
 * va creato uno Stack dedicato con `env: { region: 'us-east-1' }` e
 * istanziare al suo interno un `DnsCertificate`. Il template lascia questa
 * scelta al consumer; vedi `static forCloudFront()` come riferimento di firma.
 */

import { RemovalPolicy } from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';

export interface DnsCertificateProps {
  /** Hosted Zone usata per la validazione DNS */
  hostedZone: route53.IHostedZone;

  /** Domain name del certificato (es. `*.staging.example.com`) */
  domainName: string;

  /**
   * Include il dominio apex tra i SAN.
   * @default true
   */
  includeApex?: boolean;

  /** Se true, removalPolicy = RETAIN (non distrugge il cert in tear-down) */
  productionMode: boolean;

  /** Subject Alternative Names aggiuntivi */
  additionalSans?: string[];
}

export class DnsCertificate extends Construct {
  public readonly certificate: acm.ICertificate;

  constructor(scope: Construct, id: string, props: DnsCertificateProps) {
    super(scope, id);

    const subjectAlternativeNames: string[] = [];
    if (props.includeApex !== false) {
      const apexDomain = props.domainName.replace(/^\*\./, '');
      subjectAlternativeNames.push(apexDomain);
    }
    if (props.additionalSans) {
      subjectAlternativeNames.push(...props.additionalSans);
    }

    this.certificate = new acm.Certificate(this, 'Certificate', {
      domainName: props.domainName,
      subjectAlternativeNames: subjectAlternativeNames.length > 0
        ? subjectAlternativeNames
        : undefined,
      validation: acm.CertificateValidation.fromDns(props.hostedZone),
    });

    (this.certificate as acm.Certificate).applyRemovalPolicy(
      props.productionMode ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    );
  }

  /**
   * Helper di firma per ricordare al consumer che per CloudFront serve
   * uno Stack in us-east-1. La region NON si imposta sul Certificate ma
   * sullo Stack che contiene questo construct.
   */
  static forCloudFront(
    scope: Construct,
    id: string,
    props: DnsCertificateProps,
  ): DnsCertificate {
    return new DnsCertificate(scope, id, props);
  }
}
