import { bootstrapApplication } from '@angular/platform-browser';
import { Amplify } from 'aws-amplify';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { environment } from './environments/environment';

// Configura Amplify Auth (Cognito) con l'app client admin prima dell'avvio.
Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: environment.cognito.userPoolId,
      userPoolClientId: environment.cognito.userPoolClientId,
    },
  },
});

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
