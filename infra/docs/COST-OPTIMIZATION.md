# 💰 Guida Cost Optimization

Questa guida spiega come configurare e utilizzare il sistema di cost optimization del template CDK.

## 🎯 Budget Alerts

### Budget Mensili per Ambiente

- **Dev**: $50/mese (nessun alert - solo dev)
- **Staging**: $200/mese con alert
- **Prod**: $500/mese con alert

### Alert Configurati

- ⚠️  **50% del budget** - Primo warning ($100 per staging, $250 per prod)
- 🟠 **80% del budget** - Warning critico ($160 per staging, $400 per prod)
- 🔴 **100% del budget** - Budget superato ($200 per staging, $500 per prod)

## 📧 Configurazione Budget Email

### Variabile d'Ambiente

```bash
# Imposta email per ricevere alert budget
export BUDGET_EMAIL=team@yourcompany.com
npm run deploy:prod

# O direttamente nel comando
BUDGET_EMAIL=team@yourcompany.com npm run deploy:prod
```

### Email Multiple

Per più email, modifica `lib/stacks/cost-optimization-stack.ts`:
```typescript
subscriberEmailAddresses: [
  'team@company.com',
  'admin@company.com',
  'finance@company.com'
]
```

## 🏷️ Cost Allocation Tags

Tutti i servizi vengono automaticamente taggati con:

- `Environment`: dev/staging/prod
- `ProjectCode`: Codice progetto (es: MAP)
- `CostCenter`: Per tracking costi per ambiente
- `ManagedBy`: CDK
- `CreatedDate`: Data creazione (YYYY-MM-DD)

### Visualizzazione Costi per Tag

```bash
# Costi per ambiente
aws ce get-cost-and-usage \
  --time-period Start=2024-01-01,End=2024-01-31 \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --group-by Type=TAG,Key=Environment

# Costi per progetto
aws ce get-cost-and-usage \
  --time-period Start=2024-01-01,End=2024-01-31 \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --group-by Type=TAG,Key=ProjectCode
```

## 📊 Costi Tipici per Ambiente

### Dev (~$30-50/mese)
- EC2 t3.medium: ~$25/mese
- EBS 50GB: ~$5/mese
- Logs 7 giorni: ~$1/mese
- Scheduler: Gratuito (EventBridge)
- **Totale**: ~$31/mese

### Staging (~$100-200/mese)
- EC2 t3.large: ~$60/mese
- EBS 100GB: ~$10/mese
- NAT Gateway: ~$45/mese
- Backup: ~$10/mese
- Monitoring: ~$5/mese
- **Totale**: ~$130/mese

### Prod (~$300-500/mese)
- EC2 t3.xlarge: ~$120/mese
- EBS 200GB: ~$20/mese
- NAT Gateways (2x): ~$90/mese
- Backup: ~$30/mese
- Monitoring: ~$10/mese
- DNS: ~$0.50/mese
- **Totale**: ~$270/mese

## 💡 Ottimizzazione Costi

### Per Dev

1. **Scheduler**: Abilita auto-shutdown per risparmiare ~40% (~$10/mese)
2. **Instance Type**: Usa t3.small invece di t3.medium se possibile
3. **No NAT Gateway**: Risparmia ~$45/mese
4. **No Backup**: Non necessario per dev

### Per Staging

1. **Single NAT Gateway**: Se possibile, usa solo 1 invece di 2
2. **Volume Size**: Riduci se non necessario
3. **Backup Retention**: 30 giorni invece di 90

### Per Prod

1. **Reserved Instances**: Se l'istanza gira 24/7, usa RI per ~40% risparmio
2. **Volume Optimization**: Usa GP3 invece di GP2 (più economico)
3. **Backup Lifecycle**: Sposta backup vecchi a cold storage

## 🔍 Monitoring Costi

### AWS Cost Explorer

1. Vai su AWS Console → Cost Management → Cost Explorer
2. Filtra per tag `Environment` o `ProjectCode`
3. Visualizza costi per servizio, istanza, etc.

### Budget Reports

```bash
# Lista budget configurati
aws budgets describe-budgets \
  --account-id ACCOUNT-ID

# Visualizza budget usage
aws budgets describe-budget \
  --account-id ACCOUNT-ID \
  --budget-name MAP-prod-monthly-budget
```

## 🚨 Troubleshooting

### Budget Alert non ricevuti
- Verifica email configurata: `BUDGET_EMAIL`
- Controlla spam folder
- Verifica SNS topic subscription

### Tag non applicati
- Verifica che gli Aspects siano applicati correttamente
- Controlla CloudFormation stack tags
- Verifica che le risorse supportino tagging

### Costi imprevisti
- Verifica budget alerts configurati
- Controlla NAT Gateway usage
- Verifica backup retention
- Monitora CloudWatch logs volume

## 📝 Best Practices

1. **Budget Realistici**: Imposta budget basati su costi reali
2. **Multiple Alerts**: Usa 50%, 80%, 100% per avviso preventivo
3. **Tag Consistenti**: Usa sempre gli stessi tag per tracking
4. **Review Mensile**: Rivedi costi mensilmente
5. **Cost Allocation**: Separa costi per ambiente/progetto

## 📚 Riferimenti

- [AWS Budgets](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-managing-costs.html)
- [Cost Allocation Tags](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/cost-alloc-tags.html)
- [AWS Cost Explorer](https://docs.aws.amazon.com/cost-management/latest/userguide/ce-what-is.html)
