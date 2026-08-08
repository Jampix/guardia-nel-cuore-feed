/**
 * Configurazione dell'app client per lo SVILUPPO LOCALE (`ng serve`).
 *
 * Differenza unica: `apiUrl` è il percorso relativo `/api`, che il proxy del
 * dev server (`proxy.conf.json`) inoltra all'API di produzione. Così le
 * chiamate partono dalla STESSA origine della pagina e non c'è nessuna
 * richiesta cross-origin: è ciò che permette di non tenere `http://localhost`
 * fra le origini CORS dell'API in produzione.
 *
 * ⚠️ NON usare la stringa vuota come `apiUrl`: l'interceptor allega il token
 * alle richieste che iniziano con `apiUrl`, e con `''` **ogni** URL
 * corrisponderebbe — il JWT finirebbe anche su S3 e sul geocodificatore.
 */
export const environment = {
  apiUrl: '/api',
  cognito: {
    region: 'eu-west-1',
    userPoolId: 'eu-west-1_8tDpBt93Z',
    // App client "cittadini" (generateSecret: false).
    userPoolClientId: '1g6b1d8p5s6m82vrp1id53gkm2',
  },
};
