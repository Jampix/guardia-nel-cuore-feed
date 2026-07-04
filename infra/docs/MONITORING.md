# 📊 Guida al Monitoring

Questa guida spiega come configurare e utilizzare il sistema di monitoring del template CDK.

## 🎯 Monitoring per Ambiente

### Dev (Minimo - Gratuito)
- ✅ CloudWatch Logs (7 giorni retention)
- ❌ Nessun dashboard
- ❌ Nessun alarm costoso
- ✅ Solo logging per debug

**Costi**: ~$1-2/mese

### Staging (Bilanciato)
- ✅ CloudWatch Logs (30 giorni retention)
- ✅ Dashboard con metriche gratuite
- ✅ Alarm CPU base
- ❌ Nessun alarm memory (richiede agent)

**Costi**: ~$2-5/mese

### Prod (Completo)
- ✅ CloudWatch Logs (90 giorni retention)
- ✅ Dashboard completo con metriche gratuite
- ✅ Alarm CPU e Memory
- ✅ Health checks automatici

**Costi**: ~$5-10/mese

## 📈 Metriche Disponibili

### Metriche Gratuite AWS (incluse nel template):
- **CPU Utilization** - Utilizzo CPU
- **Network In/Out** - Traffico di rete
- **Disk Read/Write Operations** - Operazioni disco
- **Status Check Failed** - Verifica stato istanza

### Metriche che Richiedono CloudWatch Agent:
- Memory Utilization
- Disk Space Utilization
- Custom Application Metrics

## 🔔 Configurazione Alarms

### CPU Alarm
- **Dev**: Threshold 90% (più permissivo)
- **Staging**: Threshold 80% (standard)
- **Prod**: Threshold 70% (più restrittivo)

### Memory Alarm
- Solo per **Staging** e **Prod**
- Threshold: 85%
- Richiede CloudWatch Agent installato

## 📊 Accesso Dashboard

1. Vai su AWS Console → CloudWatch
2. Clicca su "Dashboards"
3. Cerca: `{PROJECT_CODE}-{ENV}-monitoring`

Oppure usa l'output del deploy:
```bash
aws cloudformation describe-stacks \
  --stack-name MAPProdMonitoringStack \
  --query 'Stacks[0].Outputs[?OutputKey==`DashboardUrl`].OutputValue' \
  --output text
```

## 📝 Visualizzazione Logs

### Via AWS Console:
1. CloudWatch → Log Groups
2. Cerca: `/{project-name}/{environment}/ec2`

### Via CLI:
```bash
# Lista log groups
aws logs describe-log-groups \
  --log-group-name-prefix "/my-project/dev"

# Visualizza log recenti
aws logs tail /my-project/dev/ec2 --follow
```

## 🔧 Configurazione Custom

### Modificare Threshold Alarms

Modifica `lib/config/environments/prod.ts`:
```typescript
features: {
  monitoring: {
    enabled: true,
    logRetention: Duration.days(90),
    alarms: true  // Abilita alarms avanzati
  }
}
```

### Abilitare Memory Monitoring

1. Installa CloudWatch Agent sull'istanza EC2
2. Configura metriche custom
3. Gli alarms memory verranno creati automaticamente

## 🚨 Troubleshooting

### Alarm non si attiva
- Verifica che l'istanza sia in running
- Controlla che le metriche siano disponibili
- Verifica i threshold impostati

### Dashboard vuoto
- Attendi qualche minuto per la raccolta dati
- Verifica che l'istanza sia attiva
- Controlla i permessi CloudWatch

### Logs non appaiono
- Verifica che l'applicazione stia loggando
- Controlla il log group corretto
- Verifica retention policy

## 💡 Best Practices

1. **Retention appropriata**: Non mantenere logs troppo a lungo in dev
2. **Threshold realistici**: Non troppo bassi per evitare false alarm
3. **Dashboard solo dove serve**: Non crearli in dev
4. **Monitora i costi**: Logs e alarms hanno costi
5. **Usa metriche gratuite**: Quando possibile

## 📚 Riferimenti

- [CloudWatch Pricing](https://aws.amazon.com/cloudwatch/pricing/)
- [CloudWatch Agent Guide](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/InstallCloudWatchAgent.html)
- [CloudWatch Metrics](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/viewing_metrics_with_cloudwatch_dashboard.html)
