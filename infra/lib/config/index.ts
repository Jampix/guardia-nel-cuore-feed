/**
 * Barrel del modulo config.
 *
 * Chi consuma le config (bin/app.ts, lib/app.ts, test) importa solo da
 * `lib/config`, mai dai singoli file interni.
 */
export type { ProjectConfig, EnvironmentConfig, CommonConfig } from './interfaces';
export type { Environment } from './accounts';
export { accounts } from './accounts';
export { commonConfig } from './common';
export { ConfigValidator } from './validator';

import type { ProjectConfig } from './interfaces';
import type { Environment } from './accounts';

/**
 * Carica dinamicamente la config per l'environment richiesto.
 *
 * In v1 è supportato solo `prod`. Per aggiungere un environment:
 *  1. aggiungi account+region in `accounts.ts`;
 *  2. crea `environments/<nome>.ts` esportando una `ProjectConfig`;
 *  3. aggiungi il case qui sotto.
 */
export async function loadConfig(env: string): Promise<ProjectConfig> {
  switch (env as Environment) {
    case 'prod': {
      const { prodConfig } = await import('./environments/prod');
      return prodConfig;
    }
    default:
      throw new Error(
        `Unknown environment "${env}". Valid values: prod.`,
      );
  }
}
