import * as cdk from 'aws-cdk-lib';
import { Aspects, AspectPriority } from 'aws-cdk-lib';

import { ProjectConfig } from './config/interfaces';
import { ConfigValidator } from './config/validator';
import { TaggingAspect } from './aspects/tagging-aspect';
import { NamingAspect } from './aspects/naming-aspect';

import { CostOptimizationStack } from './stacks/cost-optimization-stack';
import { DataStack } from './stacks/data-stack';
import { AuthStack } from './stacks/auth-stack';
import { ApiStack } from './stacks/api-stack';

/**
 * Orchestratore degli stack del progetto "Guardia nel Cuore".
 *
 * Punto unico di composizione: tutta la logica di "quale stack si crea
 * quando, e da cosa dipende" vive qui. `bin/app.ts` rimane minimale.
 *
 * Stack serverless previsti (aggiunti nei prossimi incrementi):
 *   - DataStack       → tabelle DynamoDB (Feedbacks, Votes, Categories, FeedbackComments)
 *   - AuthStack       → Cognito User Pool + gruppi cittadino/membro/admin
 *   - StorageStack    → bucket S3 privato per le foto
 *   - ApiStack        → HTTP API + Lambda + Cognito JWT authorizer
 *   - CertStack       → ACM in us-east-1 (stack dedicato, env.region us-east-1)
 *   - FrontendStack   → S3 sito statico + CloudFront (client e admin)
 *
 * Per aggiungere un nuovo stack:
 *  1. crealo in `lib/stacks/<nome>-stack.ts` esportando il tipo di props;
 *  2. importalo qui;
 *  3. aggiungi un blocco in `compose()` con eventuale feature flag e dipendenze.
 *
 * Convenzioni:
 *  - risorse serverless SENZA nome fisico (naming auto CDK, deterministico);
 *  - dipendenze tra stack sempre esplicite via `addDependency`;
 *  - riferimenti cross-stack passati come stringhe (ID/ARN), mai oggetti CDK;
 *  - naming stack uniforme: `<projectCode><Env><StackSuffix>`.
 */
export class InfrastructureApp {
  private readonly env: cdk.Environment;
  private readonly stackPrefix: string;

  constructor(
    private readonly app: cdk.App,
    private readonly config: ProjectConfig,
  ) {
    this.assertConfigValid();

    this.env = { account: config.account, region: config.region };
    this.stackPrefix = `${config.projectCode}${capitalize(config.environment)}`;

    this.applyGlobalAspects();
    this.compose();
  }

  private assertConfigValid(): void {
    console.log('🔍 Validating configuration...');
    const result = ConfigValidator.validate(this.config);
    ConfigValidator.printValidationResult(result);
    if (!result.isValid) {
      throw new Error('Deployment aborted due to configuration errors.');
    }
  }

  private applyGlobalAspects(): void {
    // Priority MUTATING esplicita: TaggingAspect e NamingAspect modificano il
    // tree (tag, Name, ecc.). Vedi docs/adr/006-tags-of-vs-property-override.md.
    Aspects.of(this.app).add(
      new TaggingAspect({
        tags: this.config.tags,
        projectCode: this.config.projectCode,
        environmentCode: undefined,
      }),
      { priority: AspectPriority.MUTATING },
    );
    Aspects.of(this.app).add(
      new NamingAspect({
        projectName: this.config.projectName,
        projectCode: this.config.projectCode,
        environment: this.config.environment,
        region: this.config.region,
      }),
      { priority: AspectPriority.MUTATING },
    );
  }

  private compose(): void {
    // Guard-rail sui costi: budget mensile con alert. Generico, nessuna
    // dipendenza da altri stack.
    new CostOptimizationStack(this.app, this.stackName('CostOptimizationStack'), {
      config: this.config,
      budgetEmail: process.env.BUDGET_EMAIL,
      env: this.env,
    });

    // Incremento 2 — Dati & Auth (stateful, nessuna dipendenza reciproca).
    const data = new DataStack(this.app, this.stackName('DataStack'), {
      config: this.config,
      env: this.env,
    });

    const auth = new AuthStack(this.app, this.stackName('AuthStack'), {
      config: this.config,
      env: this.env,
    });

    // Incremento 3 — API (HTTP API + JWT authorizer + Lambda). Dipende da
    // Data e Auth: riceve ID/ARN come stringhe (convenzione cross-stack).
    const api = new ApiStack(this.app, this.stackName('ApiStack'), {
      config: this.config,
      env: this.env,
      userPoolId: auth.userPoolId,
      clientAppClientId: auth.clientAppClientId,
      adminAppClientId: auth.adminAppClientId,
      feedbacksTableArn: data.feedbacksTableArn,
      feedbacksTableName: data.feedbacksTableName,
      categoriesTableArn: data.categoriesTableArn,
      categoriesTableName: data.categoriesTableName,
    });
    api.addDependency(data);
    api.addDependency(auth);

    // TODO(Incremento 4): CertStack (us-east-1) + FrontendStack + DNS.
  }

  /** Stampa un riepilogo del deploy. Chiamabile da `bin/app.ts` se utile. */
  public printSummary(): void {
    const c = this.config;
    console.log(`🚀 ${c.projectCode.toUpperCase()} CDK App initialized for ${c.environment.toUpperCase()}`);
    console.log(`📋 Environment: ${c.environment}`);
    console.log(`🏷️  Project: ${c.projectName}`);
    console.log(`🌐 Account: ${c.account}`);
    console.log(`📍 Region: ${c.region}`);
    if (c.features.dns?.enabled) {
      console.log(`🌍 Domain: ${c.features.dns.domain}`);
    }
    console.log(`🏷️  Tags applied: ${Object.keys(c.tags).join(', ')}`);

    const features: string[] = [];
    if (c.features.dns?.enabled) features.push('🌍 DNS');
    features.push('💰 Cost Optimization');
    console.log(`✨ Features enabled: ${features.join(', ') || '(none)'}`);
  }

  private stackName(suffix: string): string {
    return `${this.stackPrefix}${suffix}`;
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
