# Infrastruttura — Guardia nel Cuore

Infrastruttura come codice (**AWS CDK, TypeScript**) per l'app di feedback civico
**Guardia nel Cuore**. Architettura **100% serverless** (niente EC2/VPC).

Stack: Lambda (Node.js 20/TS) · API Gateway HTTP · DynamoDB · Cognito · S3 ·
CloudFront · SES · Route53/ACM. Contesto completo in
[`../docs/02-architettura-aws.md`](../docs/02-architettura-aws.md).

## Parametri
- **Account** `324908170418` · **Region** `eu-west-1` (+ `us-east-1` per il cert CloudFront) · **Ambiente** solo `prod`
- Identità: `projectName = guardia-nel-cuore`, `projectCode = GNC` → stack `GNCProd<Nome>`
- Naming risorse **auto CDK** (nessun nome fisico); gli Aspects applicano i tag standard

## Stack (orchestrati in `lib/app.ts` → `compose()`)

| Stack | Ruolo | Note |
|---|---|---|
| `GNCProdDataStack` | 4 tabelle DynamoDB (Feedbacks, Votes, Categories, FeedbackComments) | RETAIN |
| `GNCProdAuthStack` | Cognito User Pool + gruppi + 2 app client + trigger **pre-auth** | RETAIN |
| `GNCProdStorageStack` | Bucket S3 privato foto (OAC, CORS) | RETAIN |
| `GNCProdApiStack` | HTTP API + JWT authorizer + tutte le Lambda | vedi `../backend/README.md` |
| `GNCProdDnsStack` | Hosted zone `feed.` + record + identità SES (DKIM) | zona delegata dall'apex (account main) |
| `GNCProdCertStack` | Certificato ACM in **us-east-1** (per CloudFront) | env override `us-east-1` |
| `GNCProdFrontendStack` | 2 bucket S3 + 2 CloudFront (client/admin) + alias Route53 | consuma il cert per ARN (stringa) |
| `GNCProdCostOptimizationStack` | Budget alert | — |

## Struttura
```
bin/app.ts        entry point CDK
lib/
  app.ts          InfrastructureApp: orchestratore (compose())
  config/         config tipizzata + environments/prod.ts + validator
  aspects/        TaggingAspect + NamingAspect (globali)
  stacks/         gli stack sopra
  constructs/     database/ auth/ api/ functions/ cdn/ dns/ storage/
```

## Comandi
```bash
npm install
# per-stack (consigliato):
ENVIRONMENT=prod npx cdk diff   GNCProd<Stack> --profile guardia-nel-cuore
ENVIRONMENT=prod npx cdk deploy GNCProd<Stack> --profile guardia-nel-cuore
# oppure gli script:
npm run validate   # valida la config
npm run synth      # cdk synth
npm test           # jest
```
Bootstrap (già fatto su questo account): `cdk bootstrap aws://324908170418/eu-west-1`
e `aws://324908170418/us-east-1` (per il certificato CloudFront).

## Convenzioni
- Mai istanziare risorse AWS direttamente negli stack: delegare a un **construct**.
- **Cross-stack**: passare stringhe (ID/ARN), mai oggetti CDK. Cross-region (cert
  us-east-1 → FrontendStack eu-west-1): ARN come literal in `config`.
- Stack/feature opzionali sotto **feature flag** in `compose()` (es. `features.dns`).
- Deploy del frontend (build → S3 → invalidazione CloudFront): vedi il README di root.
