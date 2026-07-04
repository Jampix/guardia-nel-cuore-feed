import { Construct } from 'constructs';
import { Stack, StackProps, CfnOutput, Fn } from 'aws-cdk-lib';
import { HostedZone } from 'aws-cdk-lib/aws-route53';
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
    }
  }
}