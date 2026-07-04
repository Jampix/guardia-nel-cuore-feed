# 🎯 Quick Start Guide

Questa guida ti aiuta a iniziare rapidamente con il template CDK.

## ⚡ Setup Veloce (5 minuti)

### 1. Copia il Template
```bash
# Copia tutti i file nella tua nuova repository
cp -r template-cdk/* /path/to/new-project/
cd /path/to/new-project
```

### 2. Installa Dipendenze
```bash
npm install
```

### 3. Personalizza Configurazione Base

**Modifica `lib/config/common.ts`:**
```typescript
export const commonConfig = {
  projectName: 'my-awesome-project',  // ← Cambia qui
  projectCode: 'MAP',                  // ← Cambia qui (2-4 caratteri, max 10 per naming IT)
  managedBy: 'CF',                    // CF = CloudFormation (CDK genera CF)
  owner: 'TEAM_NAME',                 // ← Cambia qui: gruppo o persona di riferimento
};
```

**Modifica `lib/config/environments.ts`:**
```typescript
export const environments = {
  "dev": {
    "account": "123456789012",  // ← Il tuo account AWS dev
    "region": "eu-west-1"
  },
  // ... altri ambienti
};
```

### 4. Valida Configurazione
```bash
npm run validate:dev
```

### 5. Bootstrap CDK (solo prima volta)
```bash
cdk bootstrap aws://ACCOUNT-ID/REGION
```

### 6. Deploy!
```bash
npm run deploy:dev
```

## 📋 Checklist Pre-Deploy

Prima di ogni deploy, verifica:

- [ ] **Account ID** configurato correttamente
- [ ] **Region** corretta
- [ ] **Project Code** unico (2-4 caratteri maiuscoli, max 10 per naming IT)
- [ ] **Project Name** formato valido
- [ ] **Owner** configurato (gruppo/persona di riferimento)
- [ ] **Configurazione validata** (`npm run validate`)
- [ ] **KeyPair** esistente (se necessario)
- [ ] **Budget Email** configurato (per staging/prod)

## 🚀 Flusso di Lavoro Completo

```bash
# 1. Setup iniziale
cp -r template-cdk/* new-project/
cd new-project
npm install

# 2. Personalizza configurazione
# Modifica lib/config/common.ts e lib/config/environments.ts

# 3. Valida
npm run validate:dev

# 4. Bootstrap (solo prima volta)
cdk bootstrap aws://123456789012/eu-west-1

# 5. Verifica sintesi
npm run synth

# 6. Deploy
npm run deploy:dev

# 7. Verifica output
aws cloudformation describe-stacks --stack-name MAPDevNetworkStack --query 'Stacks[0].Outputs'
```

## 🔧 Configurazione Avanzata

### Configurare Budget Email
```bash
export BUDGET_EMAIL=team@yourcompany.com
npm run deploy:prod
```

### Configurare Features per Ambiente

Modifica `lib/config/environments/dev.ts`:
```typescript
features: {
  monitoring: {
    enabled: true,
    logRetention: Duration.days(7),
    alarms: false  // Nessun alarm in dev
  },
  backup: {
    enabled: false  // Nessun backup in dev
  },
  scheduler: {
    enabled: true,
    autoShutdown: true  // Auto-shutdown per risparmiare
  }
}
```

## 📚 Risorse Utili

- **[README.md](./README.md)** - Panoramica completa
- **[docs/DEPLOY.md](./docs/DEPLOY.md)** - Guida deploy dettagliata
- **[docs/MONITORING.md](./docs/MONITORING.md)** - Guida monitoring
- **[docs/COST-OPTIMIZATION.md](./docs/COST-OPTIMIZATION.md)** - Guida costi
- **[docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md)** - Risoluzione problemi
- **[RIEPILOGO.md](./RIEPILOGO.md)** - Riepilogo completo template

## 🎯 Prossimi Passi

1. ✅ **Deploy in dev** per testare
2. ✅ **Configura monitoring** se necessario
3. ✅ **Imposta budget alerts** per staging/prod
4. ✅ **Personalizza** constructs per il tuo caso d'uso
5. ✅ **Aggiungi** test per i tuoi custom constructs

## 🆘 Hai Bisogno di Aiuto?

Consulta la [guida troubleshooting](./docs/TROUBLESHOOTING.md) per problemi comuni.
