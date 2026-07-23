import { ProjectConfig } from '../interfaces';
import { commonConfig } from '../common';
import { accounts } from '../accounts';

export const prodConfig: ProjectConfig = {
  ...commonConfig,
  environment: 'prod',
  account: accounts.prod.account,
  region: accounts.prod.region,

  tags: {
    description: `Infrastruttura ${commonConfig.projectName} - Produzione`,
    project: commonConfig.projectName,
    environment: 'prod', // Mappato automaticamente a 'PRD'
    managedBy: commonConfig.managedBy,
    owner: commonConfig.owner,
  },

  alerts: {
    email: 'pasqualemazzei@gmail.com',
    budgetUsd: 15,
  },

  features: {
    // Abilitato all'Incremento 4 (hosted zone + record client/admin).
    dns: {
      enabled: true,
      domain: 'feed.guardianelcuore.it',
      // Hosted zone `feed` creata dal DnsStack (deploy 2026-07-13).
      hostedZoneId: 'Z0749602EGJJ2UCIQME2',
      // Certificato ACM (us-east-1) creato dal CertStack (deploy 2026-07-15).
      // Literal cross-region per il FrontendStack (CloudFront).
      certificateArn:
        'arn:aws:acm:us-east-1:324908170418:certificate/705c7d6d-2b39-45bc-926d-2a193c619523',
    },
  },
};
