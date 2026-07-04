# Infrastruttura — Guardia nel Cuore

Infrastruttura come codice (AWS CDK, TypeScript) per l'app di feedback civico
**Guardia nel Cuore**. Fork del template CDK aziendale, adattato a un'architettura
**100% serverless** (niente EC2/VPC).

## Stack tecnologico target
Lambda (Node.js/TS) · API Gateway HTTP · DynamoDB · Cognito · S3 · CloudFront · SES.
Vedi `../docs/02-architettura-aws.md`.

## Parametri
- **Account**: `324908170418` · **Region**: `eu-west-1` · **Ambiente**: solo `prod`.
- Identità: `projectName = guardia-nel-cuore`, `projectCode = GNC`.
- Naming risorse serverless: **auto CDK** (nessun nome fisico). Gli aspects applicano solo i tag.

## Struttura
```
bin/            entry point CDK (app.ts) + validate + tooling infra-dlc
lib/
  app.ts        InfrastructureApp: orchestratore stack (compose())
  config/       config tipizzata (interfaces, common, accounts, environments/prod, validator)
  aspects/      TaggingAspect + NamingAspect (globali)
  stacks/       stack di deploy (attuale: cost-optimization; in arrivo: data/auth/api/frontend/cert)
  constructs/   unità di riuso (attuale: dns/dns-certificate)
```

## Comandi
```bash
npm install
npm run validate     # valida la config (prod)
npm run synth        # cdk synth
npm run diff         # cdk diff
npm run deploy       # cdk deploy (prod)
npm test             # jest
```

Prima del primo deploy sull'account: `cdk bootstrap aws://324908170418/eu-west-1`
(e `aws://324908170418/us-east-1` per il certificato CloudFront, all'Incremento 4).

## Convenzioni (dal template)
- Mai istanziare risorse AWS direttamente negli stack: delegare a un construct.
- Cross-stack: passare stringhe (ID/ARN), mai oggetti CDK.
- Stack opzionali sotto feature flag in `compose()`.
- Vedi `CONVENTIONS.md` e `docs/` per i dettagli ereditati dal template.
