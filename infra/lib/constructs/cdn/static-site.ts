import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
} from 'aws-cdk-lib/aws-s3';
import {
  Distribution,
  PriceClass,
  ViewerProtocolPolicy,
} from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { ICertificate } from 'aws-cdk-lib/aws-certificatemanager';
import {
  ARecord,
  AaaaRecord,
  IHostedZone,
  RecordTarget,
} from 'aws-cdk-lib/aws-route53';
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';
import { Construct } from 'constructs';

export interface StaticSiteProps {
  /** Dominio del sito, es. `feed.guardianelcuore.it`. */
  domainName: string;
  /** Certificato ACM (us-east-1) per HTTPS su CloudFront. */
  certificate: ICertificate;
  /** Hosted zone `feed` dove creare i record alias. */
  hostedZone: IHostedZone;
  /** RemovalPolicy del bucket (DESTROY: contiene solo artefatti ricostruibili). */
  removalPolicy: RemovalPolicy;
}

/**
 * Sito statico (SPA Angular) servito da CloudFront con bucket S3 privato.
 *
 * Il bucket NON è pubblico: CloudFront lo legge tramite OAC (Origin Access
 * Control, l'approccio moderno che sostituisce l'OAI). CloudFront applica la
 * bucket policy che autorizza solo la distribuzione.
 *
 * SPA routing: le rotte lato client di Angular non esistono come oggetti S3,
 * quindi 403/404 vengono riscritti su `/index.html` con status 200 (altrimenti
 * un refresh su una rotta profonda darebbe errore).
 *
 * Crea anche i record Route53 (A + AAAA alias) verso la distribuzione.
 * Vedi `docs/02-architettura-aws.md` §Hosting FE.
 */
export class StaticSite extends Construct {
  /** Bucket privato con i file del sito. */
  public readonly bucket: Bucket;
  /** Distribuzione CloudFront davanti al bucket. */
  public readonly distribution: Distribution;

  constructor(scope: Construct, id: string, props: StaticSiteProps) {
    super(scope, id);

    this.bucket = new Bucket(this, 'SiteBucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: props.removalPolicy,
      autoDeleteObjects: props.removalPolicy === RemovalPolicy.DESTROY,
    });

    this.distribution = new Distribution(this, 'Distribution', {
      comment: props.domainName,
      defaultRootObject: 'index.html',
      domainNames: [props.domainName],
      certificate: props.certificate,
      // Europa+Nord America: sufficiente per un progetto locale, costo minore.
      priceClass: PriceClass.PRICE_CLASS_100,
      defaultBehavior: {
        // OAC: CloudFront legge il bucket privato; la policy viene applicata
        // automaticamente al bucket da questo origin.
        origin: S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        compress: true,
      },
      // SPA: qualsiasi path non trovato su S3 torna l'app (index.html) con 200,
      // così è Angular a gestire il routing.
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: Duration.minutes(5),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: Duration.minutes(5),
        },
      ],
    });

    // Record alias verso CloudFront (IPv4 + IPv6) nella zona `feed`.
    const target = RecordTarget.fromAlias(new CloudFrontTarget(this.distribution));
    new ARecord(this, 'AliasA', {
      zone: props.hostedZone,
      recordName: props.domainName,
      target,
    });
    new AaaaRecord(this, 'AliasAAAA', {
      zone: props.hostedZone,
      recordName: props.domainName,
      target,
    });
  }
}
