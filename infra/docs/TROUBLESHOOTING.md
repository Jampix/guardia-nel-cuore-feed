# 🐛 Troubleshooting

Questa guida aiuta a risolvere i problemi comuni durante l'utilizzo del template CDK.

## ❌ Errori Comuni

### Errore: "Stack name already exists"

**Problema**: Lo stack esiste già in CloudFormation.

**Soluzione**:
```bash
# Verifica se lo stack esiste
aws cloudformation describe-stacks --stack-name STACK_NAME

# Se necessario, elimina lo stack esistente
aws cloudformation delete-stack --stack-name STACK_NAME

# Attendi la cancellazione
aws cloudformation wait stack-delete-complete --stack-name STACK_NAME
```

### Errore: "Need to perform AWS calls for account"

**Problema**: CDK non è stato bootstrapato per l'account AWS.

**Soluzione**:
```bash
# Fai il bootstrap per la prima volta
cdk bootstrap aws://ACCOUNT-ID/REGION

# Esempio
cdk bootstrap aws://123456789012/eu-west-1
```

### Errore: "Credentials not found"

**Problema**: AWS CLI non è configurato correttamente.

**Soluzione**:
```bash
# Verifica le credenziali
aws configure list

# Riconfigura se necessario
aws configure

# Verifica identità
aws sts get-caller-identity
```

### Errore: "Validation failed"

**Problema**: Configurazione non valida.

**Soluzione**:
```bash
# Valida la configurazione
npm run validate:dev

# Correggi gli errori mostrati
# Ricontrolla:
# - Account ID formato corretto (12 cifre)
# - Project code formato corretto (2-4 caratteri maiuscoli)
# - Region valida AWS
```

### Errore: "Cannot find module"

**Problema**: Dipendenze non installate.

**Soluzione**:
```bash
# Installa dipendenze
npm install

# Verifica node_modules
ls node_modules

# Se necessario, pulisci e reinstalla
rm -rf node_modules package-lock.json
npm install
```

## 🔍 Problemi di Deploy

### Stack rimane in CREATE_IN_PROGRESS

**Problema**: Il deploy è bloccato o molto lento.

**Soluzione**:
```bash
# Verifica eventi dello stack
aws cloudformation describe-stack-events \
  --stack-name STACK_NAME \
  --max-items 10

# Controlla se ci sono errori
aws cloudformation describe-stack-events \
  --stack-name STACK_NAME \
  --query 'StackEvents[?ResourceStatus==`CREATE_FAILED`]'
```

### Risorse non vengono create

**Problema**: Le risorse non vengono create come previsto.

**Soluzione**:
```bash
# Verifica synth
npm run synth

# Controlla il template generato
cdk synth STACK_NAME > template.json

# Verifica configurazione
npm run validate:dev
```

### Errori di permessi IAM

**Problema**: Permessi insufficienti per creare risorse.

**Soluzione**:
```bash
# Verifica permessi attuali
aws iam get-user
aws iam list-attached-user-policies --user-name USERNAME

# Richiedi permessi necessari:
# - EC2FullAccess (per testing)
# - CloudFormationFullAccess
# - IAMFullAccess (per creare roles)
# - Route53FullAccess (se DNS abilitato)
```

## 📊 Problemi di Monitoring

### Dashboard vuoto

**Problema**: Dashboard non mostra dati.

**Soluzione**:
1. Attendi 5-10 minuti per la raccolta dati iniziale
2. Verifica che l'istanza EC2 sia running
3. Controlla che le metriche siano disponibili:
   ```bash
   aws cloudwatch get-metric-statistics \
     --namespace AWS/EC2 \
     --metric-name CPUUtilization \
     --dimensions Name=InstanceId,Value=i-1234567890abcdef0 \
     --start-time 2024-01-01T00:00:00Z \
     --end-time 2024-01-01T23:59:59Z \
     --period 3600 \
     --statistics Average
   ```

### Alarm non si attiva

**Problema**: L'alarm non scatta quando dovrebbe.

**Soluzione**:
1. Verifica threshold impostato
2. Controlla che l'istanza sia attiva
3. Verifica metriche disponibili
4. Controlla log dell'alarm:
   ```bash
   aws cloudwatch describe-alarms \
     --alarm-names ALARM_NAME \
     --query 'MetricAlarms[0].StateReason'
   ```

## 💰 Problemi di Costi

### Costi più alti del previsto

**Problema**: I costi sono superiori al budget.

**Soluzione**:
```bash
# Verifica costo attuale
aws ce get-cost-and-usage \
  --time-period Start=2024-01-01,End=2024-01-31 \
  --granularity MONTHLY \
  --metrics BlendedCost

# Filtra per ambiente
aws ce get-cost-and-usage \
  --time-period Start=2024-01-01,End=2024-01-31 \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --filter file://filter.json
```

filter.json:
```json
{
  "Tags": {
    "Key": "Environment",
    "Values": ["dev"]
  }
}
```

### Budget alert non ricevuti

**Problema**: Non ricevi email di alert budget.

**Soluzione**:
1. Verifica email configurata: `BUDGET_EMAIL`
2. Controlla spam folder
3. Verifica SNS subscription:
   ```bash
   aws sns list-subscriptions \
     --topic-arn TOPIC_ARN
   ```
4. Conferma subscription email se necessario

## 🔐 Problemi di Sicurezza

### KeyPair non trovato

**Problema**: EC2 non può utilizzare il keypair.

**Soluzione**:
```bash
# Lista keypairs disponibili
aws ec2 describe-key-pairs

# Crea nuovo keypair se necessario
aws ec2 create-key-pair \
  --key-name my-keypair \
  --query 'KeyMaterial' \
  --output text > my-keypair.pem

# Imposta permessi
chmod 400 my-keypair.pem
```

### Security Group blocca traffico

**Problema**: Non riesci a connetterti all'istanza.

**Soluzione**:
1. Verifica Security Group rules:
   ```bash
   aws ec2 describe-security-groups \
     --group-ids sg-1234567890abcdef0
   ```
2. Aggiungi regola per tuo IP:
   ```bash
   aws ec2 authorize-security-group-ingress \
     --group-id sg-1234567890abcdef0 \
     --protocol tcp \
     --port 22 \
     --cidr YOUR_IP/32
   ```

## 🆘 Risorse Utili

### Log CDK
```bash
# Attiva debug logging
CDK_DEBUG=true cdk deploy

# Log verbose
cdk deploy --verbose
```

### CloudFormation Logs
```bash
# Eventi stack
aws cloudformation describe-stack-events \
  --stack-name STACK_NAME \
  --max-items 50

# Template attuale
aws cloudformation get-template \
  --stack-name STACK_NAME
```

### Supporto

- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [CloudFormation Troubleshooting](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/troubleshooting.html)
- [AWS Support](https://console.aws.amazon.com/support/)

## 📝 Checklist Pre-Deploy

Prima di ogni deploy, verifica:

- [ ] Credenziali AWS configurate correttamente
- [ ] CDK bootstrapato per l'account
- [ ] Configurazione validata (`npm run validate`)
- [ ] Account ID corretto
- [ ] Region corretta
- [ ] Project code unico
- [ ] KeyPair esistente (se necessario)
- [ ] Budget email configurato (per staging/prod)
