/**
 * Configurazione comune a tutti gli ambienti.
 *
 * Identità del progetto "Guardia nel Cuore" (app di feedback civico).
 */
export const commonConfig = {
  /** Nome del progetto (lowercase, trattini ammessi) */
  projectName: 'guardia-nel-cuore',

  /** Codice breve del progetto (2-4 caratteri maiuscoli) */
  projectCode: 'GNC',

  /** Strumento di gestione: CF = CloudFormation (CDK genera CloudFormation) */
  managedBy: 'CF' as string,

  /** Gruppo o persona di riferimento per la gestione dell'infrastruttura */
  owner: 'Guardia nel Cuore',
};
