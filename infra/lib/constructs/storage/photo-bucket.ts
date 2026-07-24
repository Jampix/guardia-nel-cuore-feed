import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
  HttpMethods,
} from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface PhotoBucketConstructProps {
  /** RemovalPolicy per il bucket (DESTROY in costruzione, RETAIN a go-live). */
  removalPolicy: RemovalPolicy;
  /**
   * Origini HTTP autorizzate per l'upload presigned dal browser (CORS).
   * Es. ['https://feed.guardianelcuore.it', 'https://admin.feed.guardianelcuore.it'].
   */
  allowedOrigins: string[];
}

/**
 * Bucket S3 PRIVATO per le foto dei feedback.
 *
 * I cittadini caricano le immagini direttamente dal browser tramite URL
 * prefirmati (presigned) generati da una Lambda: il traffico non passa da
 * Lambda. Il bucket resta privato (BLOCK_ALL) — anche la lettura sulla bacheca
 * avviene via presigned GET. Vedi `docs/02-architettura-aws.md` §Foto.
 *
 * Nessun nome fisico impostato: CloudFormation genera un nome deterministico
 * dal logical ID (supera il determinism check di infra-dlc).
 */
export class PhotoBucketConstruct extends Construct {
  /** Bucket delle foto dei feedback. */
  public readonly bucket: Bucket;

  constructor(scope: Construct, id: string, props: PhotoBucketConstructProps) {
    super(scope, id);

    this.bucket = new Bucket(this, 'Photos', {
      // Privato: accesso solo via URL prefirmati.
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      // SSE-S3: cifratura a riposo gestita da S3, gratuita.
      encryption: BucketEncryption.S3_MANAGED,
      // Nega ogni richiesta non-TLS.
      enforceSSL: true,
      removalPolicy: props.removalPolicy,
      // Svuota gli oggetti su `cdk destroy` (solo perché in fase di build:
      // TODO(go-live) rimuovere insieme al passaggio a RETAIN).
      autoDeleteObjects: props.removalPolicy === RemovalPolicy.DESTROY,
      // Versioning: una cancellazione/sovrascrittura non è definitiva (le
      // versioni precedenti restano recuperabili). Le versioni non correnti
      // vengono comunque eliminate dopo 90 giorni per contenere i costi.
      versioned: true,
      // CORS: l'upload presigned parte dal browser (PUT/GET) → vanno
      // autorizzate esplicitamente le origini del frontend.
      cors: [
        {
          allowedMethods: [HttpMethods.PUT, HttpMethods.GET, HttpMethods.HEAD],
          allowedOrigins: props.allowedOrigins,
          allowedHeaders: ['*'],
          exposedHeaders: ['ETag'],
        },
      ],
      // Housekeeping: aborta gli upload multipart incompleti (upload orfani
      // dal browser) dopo 1 giorno, così non accumulano costi.
      lifecycleRules: [
        {
          abortIncompleteMultipartUploadAfter: Duration.days(1),
          // Le versioni non correnti (post-cancellazione/sovrascrittura) si
          // eliminano dopo 90 giorni: recupero possibile senza costi illimitati.
          noncurrentVersionExpiration: Duration.days(90),
        },
      ],
    });
  }
}
