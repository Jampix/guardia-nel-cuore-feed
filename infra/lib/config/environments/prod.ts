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

  features: {
    // Abilitato all'Incremento 4 (hosted zone + record client/admin).
    dns: {
      enabled: true,
      domain: 'feed.guardianelcuore.it',
      // Hosted zone `feed` creata dal DnsStack (deploy 2026-07-13).
      hostedZoneId: 'Z0749602EGJJ2UCIQME2',
    },
  },
};
