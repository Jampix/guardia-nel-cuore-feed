import { defineConfig } from 'vitest/config';

// Gli handler leggono le variabili d'ambiente al caricamento del modulo:
// le impostiamo qui così l'import statico negli test funziona.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    env: {
      FEEDBACKS_TABLE: 'Feedbacks-test',
      VOTES_TABLE: 'Votes-test',
      CATEGORIES_TABLE: 'Categories-test',
      PHOTO_BUCKET: 'photos-test',
      USER_POOL_ID: 'eu-west-1_TEST',
      FROM_EMAIL: 'noreply@feed.guardianelcuore.it',
      CLIENT_URL: 'https://feed.guardianelcuore.it',
    },
  },
});
