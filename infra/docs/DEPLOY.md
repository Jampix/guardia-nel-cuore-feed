# 🚀 Guida al Deploy

Questa guida spiega come fare il deploy del template CDK per i vari ambienti.

## 📋 Prerequisiti

1. **AWS CLI configurato**:
   ```bash
   aws configure list
   ```

2. **CDK Bootstrap** (solo la prima volta):
   ```bash
   cdk bootstrap aws://ACCOUNT-ID/REGION
   ```

3. **Dipendenze installate**:
   ```bash
   npm install
   ```

## 🔧 Configurazione Iniziale

### 1. Personalizza la Configurazione

Modifica `lib/config/common.ts`:
```typescript
export const commonConfig = {
  projectName: 'my-awesome-project',
  projectCode: 'MAP',
  managedBy: 'CDK',
};
```

Modifica `lib/config/environments.ts`:
```typescript
export const environments = {
  "dev": {
    "account": "123456789012",  // Il tuo account dev
    "region": "eu-west-1"
  },
  // ... altri ambienti
};
```

### 2. Valida la Configurazione

```bash
# Valida configurazione dev
npm run validate:dev

# Valida configurazione prod
npm run validate:prod
```

## 🚀 Deploy per Ambiente

### Deploy Dev

```bash
# Deploy dev
npm run deploy:dev

# Oppure con environment variable esplicita
ENVIRONMENT=dev cdk deploy
```

### Deploy Staging

```bash
# Deploy staging con budget alerts
export BUDGET_EMAIL=team@yourcompany.com
npm run deploy:staging
```

### Deploy Prod

```bash
# Deploy prod con budget alerts
export BUDGET_EMAIL=admin@yourcompany.com
npm run deploy:prod
```

## 📊 Verifica Deploy

Dopo il deploy, verifica gli output:

```bash
# Lista tutti gli stack deployati
aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE

# Visualizza output di uno stack
aws cloudformation describe-stacks --stack-name MAPDevNetworkStack --query 'Stacks[0].Outputs'
```

## 🔍 Diff e Synth

Prima del deploy, puoi verificare le modifiche:

```bash
# Mostra le differenze rispetto al deploy attuale
npm run diff

# Genera il CloudFormation template senza deployare
npm run synth
```

## 🗑️ Destroy

Per rimuovere tutte le risorse:

```bash
# ⚠️ ATTENZIONE: Questo cancella tutte le risorse!
cdk destroy
```

## 🐛 Troubleshooting

### Errore: "Stack name already exists"
```bash
# Verifica se lo stack esiste
aws cloudformation describe-stacks --stack-name STACK_NAME

# Se necessario, elimina lo stack esistente
aws cloudformation delete-stack --stack-name STACK_NAME
```

### Errore: "Need to perform AWS calls for account"
```bash
# Fai il bootstrap
cdk bootstrap aws://ACCOUNT-ID/REGION
```

### Errore di permessi
```bash
# Verifica i permessi AWS
aws sts get-caller-identity

# Verifica le credenziali
aws configure list
```

## 📝 Best Practices

1. **Sempre valida prima del deploy**: `npm run validate:ENV`
2. **Usa diff prima di deploy**: `npm run diff`
3. **Deploy in dev prima di prod**: Testa sempre prima in dev
4. **Configura budget alerts**: Soprattutto per staging/prod
5. **Review dei cambiamenti**: Controlla sempre cosa viene deployato

## 🎯 Ordine di Deploy Consigliato

1. **Network Stack** - VPC, Security Groups, Elastic IP
2. **Compute Stack** - EC2 Instances
3. **Storage Stack** - EBS Volumes
4. **Monitoring Stack** - CloudWatch (se abilitato)
5. **Backup Stack** - AWS Backup (se abilitato)
6. **DNS Stack** - Route53 (se abilitato)
7. **Scheduler Stack** - EventBridge (se abilitato) - **Usa EventBridge direttamente, nessuna Lambda richiesta**
8. **Cost Optimization Stack** - Budget (solo staging/prod)

Gli stack vengono deployati automaticamente nell'ordine corretto grazie alle dipendenze CDK.

**Nota**: Lo scheduler usa EventBridge con `AwsApi` target per chiamare direttamente le API EC2, senza bisogno di Lambda functions. Questo rende la soluzione più semplice, economica e sicura.
