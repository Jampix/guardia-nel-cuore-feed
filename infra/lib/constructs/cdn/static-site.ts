import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
} from 'aws-cdk-lib/aws-s3';
import {
  Distribution,
  HeadersFrameOption,
  HeadersReferrerPolicy,
  PriceClass,
  ResponseHeadersPolicy,
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
  /**
   * Origini esterne che le pagine possono contattare, oltre a se stesse
   * (`connect-src` della CSP): API, Cognito, S3 delle foto, geocodifica.
   */
  connectSrc: string[];
  /** Origini da cui l'app carica immagini (`img-src`): tessere mappa, foto S3. */
  imgSrc: string[];
}

/**
 * Content-Security-Policy delle due SPA.
 *
 * Il token di sessione sta in `localStorage`: se un giorno finisse in pagina del
 * codice non nostro, la CSP è ciò che rende difficile esfiltrarlo. Senza di essa
 * qualunque script iniettato potrebbe leggerlo e spedirlo dove vuole.
 *
 * Gli host non sono inventati: sono quelli che il codice contatta davvero
 * (verificati cercando ogni URL nei sorgenti di client, admin e shared).
 *
 * Scelte che sembrano lasche ma non lo sono:
 * - `default-src 'self'` invece di `'none'`: se un tipo di risorsa mi è
 *   sfuggito, ricade su same-origin — che per questa app va bene — invece di
 *   rompersi. È l'unico punto in cui preferisco l'indulgenza: le pagine dietro
 *   l'accesso non posso provarle senza credenziali.
 * - `'unsafe-inline'` **solo** per gli stili: Angular Material scrive attributi
 *   `style` a mano (ripple, overlay, animazioni) e senza questo l'interfaccia si
 *   scompone. Sugli script NON c'è: nell'index pubblicato non esiste alcuno
 *   script inline (verificato), che è la parte che conta davvero.
 * - `blob:` in `img-src`: l'anteprima della foto prima dell'invio usa
 *   `URL.createObjectURL`.
 * - S3 compare in `connect-src` (il PUT prefirmato) e in `img-src` (le foto
 *   servite con GET prefirmato), con entrambe le forme di host perché l'SDK può
 *   usare lo stile virtual-hosted o quello con il bucket nel path.
 */
function csp(props: StaticSiteProps): string {
  const esterni = (v: string[]) => v.join(' ');
  return [
    "default-src 'self'",
    "script-src 'self'",
    // Material Icons arriva ancora dal CDN Google (self-host = TODO noto).
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    `img-src 'self' data: blob: ${esterni(props.imgSrc)}`,
    `connect-src 'self' ${esterni(props.connectSrc)}`,
    "manifest-src 'self'",
    "base-uri 'self'",
    // `'self'` e non `'none'`: contro l'esfiltrazione conta impedire l'invio
    // VERSO L'ESTERNO, e `'none'` bloccherebbe anche un invio nativo
    // same-origin se una form sfuggisse alla gestione di Angular — un difetto
    // silenzioso (il pulsante non fa niente) in cambio di nessuna protezione
    // in più.
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join('; ');
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

    // Header di sicurezza: le due distribuzioni non ne mandavano nessuno.
    // HSTS include i sottodomini perché `admin.feed` è un sottodominio di `feed`
    // ed è anch'esso solo HTTPS. Niente `preload`: si annuncerebbe il dominio a
    // una lista da cui è lento e scomodo uscire.
    const headers = new ResponseHeadersPolicy(this, 'SecurityHeaders', {
      comment: `Header di sicurezza - ${props.domainName}`,
      securityHeadersBehavior: {
        strictTransportSecurity: {
          accessControlMaxAge: Duration.days(365),
          includeSubdomains: true,
          override: true,
        },
        contentTypeOptions: { override: true },
        // DENY: l'app si usa dopo l'accesso, incorniciarla altrove servirebbe
        // solo a far cliccare qualcuno su qualcosa che non vede.
        frameOptions: { frameOption: HeadersFrameOption.DENY, override: true },
        // Verso terzi (tessere OSM, geocodifica) parte solo l'origine, non il
        // percorso: gli indirizzi delle pagine contengono l'id delle proposte.
        referrerPolicy: {
          referrerPolicy: HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
        contentSecurityPolicy: { contentSecurityPolicy: csp(props), override: true },
      },
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
        responseHeadersPolicy: headers,
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
