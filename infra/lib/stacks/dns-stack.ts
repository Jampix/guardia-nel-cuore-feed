import { Construct } from 'constructs';
import { Stack, StackProps, CfnOutput, Fn, Duration } from 'aws-cdk-lib';
import { HostedZone, TxtRecord } from 'aws-cdk-lib/aws-route53';
import { EmailIdentity, Identity } from 'aws-cdk-lib/aws-ses';
import { ProjectConfig } from '../config/interfaces';

export interface DnsStackProps extends StackProps {
  projectName: string;
  domain?: string;
}

export class DnsStack extends Stack {
  public readonly hostedZone: HostedZone;

  constructor(scope: Construct, id: string, props: DnsStackProps) {
    super(scope, id, props);

    // Only create hosted zone if domain is provided
    if (props.domain) {
      this.hostedZone = new HostedZone(this, 'HostedZone', {
        zoneName: props.domain,
        comment: `Hosted zone for ${props.projectName}`,
      });

      // Outputs
      new CfnOutput(this, 'HostedZoneId', {
        value: this.hostedZone.hostedZoneId,
        description: 'Route53 Hosted Zone ID',
        exportName: `${props.projectName}-hosted-zone-id`,
      });

      // hostedZoneNameServers e' un token: la concatenazione runtime va
      // delegata a CloudFormation con Fn.join, NON ad Array.join() di JS.
      new CfnOutput(this, 'NameServers', {
        value: Fn.join(',', this.hostedZone.hostedZoneNameServers ?? []),
        description: 'Route53 Name Servers',
        exportName: `${props.projectName}-name-servers`,
      });

      // Identità SES per il dominio: aggiunge i record DKIM nella zona feed,
      // così le email transazionali (es. cambio stato) partono da
      // noreply@<domain> con verifica DKIM. Vedi §Email (SES) architettura.
      new EmailIdentity(this, 'FeedEmailIdentity', {
        identity: Identity.publicHostedZone(this.hostedZone),
      });

      // SPF: autorizza SES come unico mittente per il dominio. Nota: per
      // default SES usa un MAIL FROM su amazonses.com, quindi l'SPF non è
      // "allineato" ai fini DMARC (ci pensa il DKIM, che è allineato). Serve
      // comunque perché diversi filtri controllano l'SPF del dominio del From.
      new TxtRecord(this, 'SpfRecord', {
        zone: this.hostedZone,
        values: ['v=spf1 include:amazonses.com -all'],
        ttl: Duration.hours(1),
      });

      // DMARC in `quarantine`: chi riceve tratta come sospetta la posta che si
      // spaccia per questo dominio senza esserne autorizzata. Alzato da `none`
      // dopo due settimane di dati: 50 invii, 50 consegne, zero rimbalzi e zero
      // lamentele — consegna al 100%, quindi l'allineamento DKIM regge su tutta
      // la posta (l'unico mittente e' SES con l'identita' del dominio).
      //
      // Allineamento `r` (relaxed) e non `s`: per default SES usa un MAIL FROM
      // su amazonses.com, quindi l'SPF non e' allineato e a portare il DMARC e'
      // il DKIM. Con `s` non cambierebbe l'esito, ma `r` non lascia margini.
      //
      // ⚠️ NON passare a `reject` finche' non si ricevono i report DMARC (manca
      // `rua`, vedi README § Lancio pubblico): senza visibilita' si scarterebbe
      // posta legittima senza accorgersene.
      new TxtRecord(this, 'DmarcRecord', {
        zone: this.hostedZone,
        recordName: '_dmarc',
        values: ['v=DMARC1; p=quarantine; adkim=r; aspf=r'],
        ttl: Duration.hours(1),
      });
    }
  }
}