# Frontend — Guardia nel Cuore

Workspace **Angular 20** multi-progetto (Angular Material M3), mobile-first, tema
chiaro/scuro.

```
projects/client   app cittadini   → feed.guardianelcuore.it
projects/admin    backoffice      → admin.feed.guardianelcuore.it
projects/shared   libreria condivisa: modelli (Feedback, Category, …) e AuthService (Cognito/Amplify)
```

## Requisiti
- **Node 22 LTS** (`nvm use 22`) — Angular 20 non supporta Node 25.
- CLI via `npx ng` (v20 locale del workspace), non la eventuale `ng` globale.

## Sviluppo
```bash
nvm use 22
npm install
npx ng serve client --port 4200   # http://localhost:4200
npx ng serve admin  --port 4300   # http://localhost:4300
```
Le app puntano all'API di produzione (`projects/<app>/src/environments/environment.ts`);
non serve backend locale.

## Build & deploy
```bash
npx ng build client   # → dist/client/browser
npx ng build admin    # → dist/admin/browser
```
Deploy su S3 + CloudFront: vedi la sezione "Deploy" nel [README di root](../README.md).

## Note
- **Tema**: palette M3 calda generata in `projects/shared/styles/_theme-colors.scss`
  (seed `#C0392B` / `#E67E22`), font stack di sistema Apple, `color-scheme: light dark`.
- **Auth**: `AuthService` in `shared` (Amplify → Cognito); ogni app configura Amplify
  al bootstrap (`main.ts`) col proprio app client. Guard + interceptor JWT per-app.
- **Mappa**: Leaflet + OpenStreetMap (`projects/client/.../components/feedback-map`).
