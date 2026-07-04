/**
 * Mappatura environment -> AWS account & region.
 *
 * Progetto "Guardia nel Cuore": in v1 esiste solo l'ambiente `prod`.
 * Ulteriori ambienti (dev/staging) si aggiungono qui + un file
 * `environments/<nome>.ts` + il case in `config/index.ts`.
 */
export const accounts = {
  prod: {
    account: '324908170418',
    region: 'eu-west-1',
  },
} as const;

export type Environment = keyof typeof accounts;
