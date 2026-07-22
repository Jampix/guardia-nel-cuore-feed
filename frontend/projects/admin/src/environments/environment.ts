/**
 * Configurazione del backoffice (admin).
 * Stesso User Pool del client, ma app client "admin" (generateSecret: false).
 */
export const environment = {
  apiUrl: 'https://dex1zyd5pe.execute-api.eu-west-1.amazonaws.com',
  cognito: {
    region: 'eu-west-1',
    userPoolId: 'eu-west-1_8tDpBt93Z',
    // App client "admin".
    userPoolClientId: '3ba3hvlq6rtl7dlj476veee8mu',
  },
};
