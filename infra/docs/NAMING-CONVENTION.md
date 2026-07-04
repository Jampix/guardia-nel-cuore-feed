# 🏷️ Convenzione di Naming e Tagging IT

Questo documento descrive le convenzioni di naming e tagging implementate nel template secondo gli standard IT aziendali.

## 📋 Tagging Standard IT

Tutte le risorse AWS vengono automaticamente taggate con i seguenti tag standard:

### Tag Obbligatori

| Tag | Descrizione | Valori Possibili | Esempio |
|-----|-------------|-------------------|---------|
| **Description** | Descrizione dell'oggetto | Testo libero | "Infrastructure for MyProject - Production environment" |
| **Project** | Progetto di riferimento | Nome del progetto | "my-awesome-project" |
| **Environment** | Ambiente applicativo | `PRD`, `STG`, `TST`, `DEV`, `UAT`, `PPR` | `PRD` |
| **Name** | Nome dell'oggetto | Secondo convenzione IT | `plasMAP0000001aew1` |
| **ManagedBy** | Strumento di gestione | `CF`, `TF`, `OT`, `Manual` | `CF` (CloudFormation) |
| **Owner** | Gruppo/persona di riferimento | Testo libero | "DevOps Team" |

### Mapping Automatico Environment

Il template mappa automaticamente gli environment interni ai codici standard IT:

- `dev` / `development` → `DEV`
- `staging` → `STG`
- `prod` / `production` → `PRD`
- `test` → `TST`
- `uat` → `UAT`
- `ppr` → `PPR`

### Configurazione Tag

I tag vengono configurati in `lib/config/environments/{env}.ts`:

```typescript
tags: {
  description: `Infrastructure for ${commonConfig.projectName} - Production environment`,
  project: commonConfig.projectName,
  environment: 'prod', // Mappato automaticamente a 'PRD'
  managedBy: commonConfig.managedBy, // 'CF' per CloudFormation
  owner: commonConfig.owner, // Configurato in common.ts
}
```

## 🏗️ Convenzione di Naming IT

Per risorse server-like (EC2, Load Balancer, WAF, Firewall), il template applica la convenzione IT standard.

### Formato Nome

```
{env}{os}{function}{project}{seq}{location}
```

Dove:
- **env** (1 char): Ambiente applicativo
  - `p` = produzione
  - `s` = staging
  - `t` = test/development
- **os** (1 char): Sistema operativo
  - `l` = GNU/Linux
  - `w` = Windows
  - `a` = Appliance
- **function** (2 chars): Funzione ricoperta
  - `as` = application server
  - `db` = database server
  - `lb` = load balancer / reverse proxy
  - `fw` = firewall
  - `wf` = web application firewall
  - `ru` = runner / agent
  - `am` = application middleware
- **project** (max 10 chars): Nome o sigla del progetto
  - Usa `projectCode` + `projectName` se necessario
  - Per infrastruttura condivisa: `infra`
- **seq** (2 chars): Numero sequenziale (00-99)
  - Incrementale per tipo di risorsa
- **location** (4 chars): Sede d'installazione
  - `aew1` = AWS Europe West 1 (Ireland)
  - `aec1` = AWS Europe Central 1 (Frankfurt)
  - `aes1` = AWS Europe South 1 (Milan)
  - `aew2` = AWS Europe West 2 (London)
  - Altri codici AWS disponibili

### Esempi

**Application Server Linux in staging, progetto MAP, AWS Ireland:**
```
slasMAP0000001aew1
```
- `s` = staging
- `l` = Linux
- `as` = application server
- `MAP` = project code
- `00` = sequenziale
- `aew1` = AWS Ireland

**Database Server Linux in produzione, progetto SAPB1CLIENTE, AWS Frankfurt:**
```
pldbSAPB1CLIEN01aec1
```
- `p` = production
- `l` = Linux
- `db` = database server
- `SAPB1CLIEN` = project (troncato a 10 chars)
- `01` = sequenziale
- `aec1` = AWS Frankfurt

**Load Balancer in produzione, progetto MAP, AWS Milan:**
```
pllbMAP0000001aes1
```
- `p` = production
- `l` = Linux (default per risorse AWS)
- `lb` = load balancer
- `MAP` = project code
- `00` = sequenziale
- `aes1` = AWS Milan

## 🔧 Personalizzazione

### Personalizzare Function Code

Per risorse EC2 che non sono application server, puoi specificare il function code via metadata:

```typescript
// In un construct personalizzato
const instance = new ec2.Instance(this, 'DatabaseInstance', {
  // ... configurazione
});

// Aggiungi metadata per function code
instance.node.defaultChild?.addMetadata('functionType', 'db'); // database server
```

Function codes disponibili:
- `as` - Application Server (default per EC2)
- `db` - Database Server
- `lb` - Load Balancer
- `fw` - Firewall
- `wf` - Web Application Firewall
- `ru` - Runner/Agent
- `am` - Application Middleware

### Personalizzare OS Type

Per istanze Windows o Appliance:

```typescript
instance.node.defaultChild?.addMetadata('osType', 'w'); // Windows
// oppure
instance.node.defaultChild?.addMetadata('osType', 'a'); // Appliance
```

### Risorse con Naming Legacy

Le seguenti risorse usano il naming legacy (`{PROJECT_CODE}-{ENV}-{TYPE}-{RANDOM_SUFFIX}`):
- VPC
- Subnets
- Security Groups
- S3 Buckets
- CloudWatch Log Groups
- IAM Roles
- Route53 Resources
- Altri servizi AWS senza mapping diretto

Questo garantisce compatibilità e funzionalità per tutte le risorse.

## 📍 Mapping Region AWS

Il template mappa automaticamente le regioni AWS ai codici location:

| AWS Region | Location Code | Descrizione |
|------------|---------------|-------------|
| `eu-west-1` | `aew1` | AWS Europe West 1 (Ireland) |
| `eu-central-1` | `aec1` | AWS Europe Central 1 (Frankfurt) |
| `eu-south-1` | `aes1` | AWS Europe South 1 (Milan) |
| `eu-west-2` | `aew2` | AWS Europe West 2 (London) |
| `eu-west-3` | `aew3` | AWS Europe West 3 (Paris) |
| `eu-north-1` | `aen1` | AWS Europe North 1 (Stockholm) |
| `us-east-1` | `aue1` | AWS US East 1 (N. Virginia) |
| `us-east-2` | `aue2` | AWS US East 2 (Ohio) |
| `us-west-1` | `auw1` | AWS US West 1 (N. California) |
| `us-west-2` | `auw2` | AWS US West 2 (Oregon) |
| `ap-southeast-1` | `aps1` | AWS Asia Pacific Southeast 1 (Singapore) |
| `ap-southeast-2` | `aps2` | AWS Asia Pacific Southeast 2 (Sydney) |
| `ap-northeast-1` | `apn1` | AWS Asia Pacific Northeast 1 (Tokyo) |
| `sa-east-1` | `asa1` | AWS South America East 1 (São Paulo) |
| `ca-central-1` | `aca1` | AWS Canada Central 1 (Montreal) |

Per regioni non mappate, viene generato un codice fallback basato sulla regione.

## ✅ Best Practices

1. **Project Code**: Usa 2-4 caratteri maiuscoli, preferibilmente significativi
2. **Owner**: Specifica sempre un gruppo o persona responsabile
3. **Description**: Fornisci descrizioni chiare e significative
4. **Sequenziale**: Il sistema gestisce automaticamente i numeri sequenziali
5. **Function Code**: Usa il metadata solo se necessario (default `as` per EC2)

## 🔍 Verifica Tag e Naming

Dopo il deploy, verifica i tag applicati:

```bash
# Verifica tag di un'istanza EC2
aws ec2 describe-instances \
  --instance-ids i-1234567890abcdef0 \
  --query 'Reservations[0].Instances[0].Tags'

# Verifica nome risorsa
aws ec2 describe-instances \
  --instance-ids i-1234567890abcdef0 \
  --query 'Reservations[0].Instances[0].Tags[?Key==`Name`].Value'
```

## 📚 Riferimenti

- [Tagging Best Practices AWS](https://docs.aws.amazon.com/general/latest/gr/aws_tagging.html)
- [CDK Aspects Documentation](https://docs.aws.amazon.com/cdk/v2/guide/aspects.html)
- Convenzione IT aziendale (documento interno)

