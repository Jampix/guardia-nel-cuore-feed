# 📚 Indice Documentazione

Questa è la documentazione completa del template CDK. Ogni guida copre un aspetto specifico del template.

## 📖 Guide Disponibili

### 🚀 [DEPLOY.md](./DEPLOY.md)
Guida completa al deploy del template per tutti gli ambienti.
- Prerequisiti
- Configurazione iniziale
- Deploy per ambiente
- Verifica deploy
- Troubleshooting

### 📊 [MONITORING.md](./MONITORING.md)
Guida al sistema di monitoring e CloudWatch.
- Monitoring per ambiente
- Metriche disponibili
- Configurazione alarms
- Dashboard CloudWatch
- Troubleshooting

### 💰 [COST-OPTIMIZATION.md](./COST-OPTIMIZATION.md)
Guida alla gestione e ottimizzazione dei costi.
- Budget alerts
- Cost allocation tags
- Analisi costi per ambiente
- Ottimizzazione costi
- Best practices

### 🐛 [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
Guida alla risoluzione problemi comuni.
- Errori comuni
- Problemi di deploy
- Problemi di monitoring
- Problemi di costi
- Checklist pre-deploy

### 📚 [SELF-DOCUMENTATION.md](./SELF-DOCUMENTATION.md)
Guida alla self-documentation con JSDoc e TypeDoc.
- Generazione documentazione automatica
- Standard JSDoc nel template
- Best practices
- Visualizzazione in IDE
- Aggiornamento documentazione

## 🎯 Quick Start

1. **Leggi il README principale** per panoramica generale
2. **Configura il progetto** seguendo [DEPLOY.md](./DEPLOY.md)
3. **Fai il deploy** in dev per testare
4. **Configura monitoring** seguendo [MONITORING.md](./MONITORING.md)
5. **Imposta budget** seguendo [COST-OPTIMIZATION.md](./COST-OPTIMIZATION.md)

## 📋 Argomenti Principali

### Configurazione
- Setup iniziale
- Personalizzazione progetto
- Configurazione ambienti
- Validazione configurazione

### Deploy
- Deploy per ambiente
- Stack dependencies
- Verifica deploy
- Rollback

### Monitoring
- CloudWatch Logs
- CloudWatch Dashboards
- Alarms
- Metriche

### Cost Optimization
- Budget alerts
- Cost allocation tags
- Analisi costi
- Ottimizzazione

### Sicurezza
- IAM roles
- Security Groups
- Encryption
- Secrets Management

### Troubleshooting
- Errori comuni
- Debug
- Log analysis
- Support

## 📚 Documentazione API Generata

La documentazione API viene generata automaticamente da JSDoc comments nel codice:

```bash
# Genera documentazione
npm run docs

# La documentazione viene creata in docs/api/
```

Vedi [SELF-DOCUMENTATION.md](./SELF-DOCUMENTATION.md) per dettagli.

## 🔗 Link Utili

- [README Principale](../README.md)
- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [CloudFormation Documentation](https://docs.aws.amazon.com/cloudformation/)
- [AWS Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/)
- [TypeDoc Documentation](https://typedoc.org/)
