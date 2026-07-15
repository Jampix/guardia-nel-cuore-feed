/**
 * Configurazione dell'app cittadini.
 * L'HTTP API è unica (prod) per ora: nessun replacement dev/prod.
 * Gli identificatori Cognito NON sono segreti (client pubblico SPA).
 */
export const environment = {
  apiUrl: 'https://dex1zyd5pe.execute-api.eu-west-1.amazonaws.com',
  cognito: {
    region: 'eu-west-1',
    userPoolId: 'eu-west-1_8tDpBt93Z',
    // App client "cittadini" (generateSecret: false).
    userPoolClientId: '1g6b1d8p5s6m82vrp1id53gkm2',
  },
};
